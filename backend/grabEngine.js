const incoinClient = require('./incoinClient');
const pakkagoClient = require('./pakkagoClient');

function resolveClient(provider) {
  return provider === 'pakkago' ? pakkagoClient : incoinClient;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Helper for human-like delays
const randomDelay = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const humanDelay = {
  betweenPolls: () => randomDelay(1000, 2500),        // Checking for tasks
  betweenTasks: () => randomDelay(1500, 3500),        // After grabbing tasks
  betweenBatchTasks: () => randomDelay(500, 1500),    // Within a batch
  onError: (attempt) => Math.min(10000, 2000 * Math.pow(1.5, attempt)) + randomDelay(0, 1000),
  emptyResult: () => randomDelay(800, 2000),          // No tasks found
};

/**
 * The Incoin task-processing engine with human-like behavior:
 *   • No stale/date filtering — grab everything the API returns.
 *   • No blacklisting of transient failures — they may reappear.
 *   • Up to 3 concurrent tasks per iteration for natural pacing.
 *   • Randomized delays between operations to simulate human behavior.
 *
 * Emits TaskResult-like objects through [onEvent]:
 *   { success, message, status, logs, processed, progress, processedTasks }
 */
class GrabEngine {
  constructor({ username, token, minAmount, maxAmount, targetCount, preferredToolName, provider, onEvent }) {
    this.username = username;
    this.token = token;
    this.minAmount = minAmount;
    this.maxAmount = maxAmount;
    this.targetCount = targetCount;
    this.preferredToolName = preferredToolName || 'Freecharge';
    this.provider = provider === 'pakkago' ? 'pakkago' : 'incoin';
    this.client = resolveClient(this.provider);
    this.onEvent = onEvent || (() => {});
    this.stopRequested = false;
    this.stopped = false;
  }

  stop() {
    this.stopRequested = true;
  }

  _emit(partial) {
    const event = {
      success: partial.success,
      message: partial.message,
      status: partial.status || partial.message,
      logs: partial.logs,
      processed: partial.processed,
      progress: partial.progress,
      processedTasks: partial.processedTasks || [],
    };
    this.onEvent(event);
  }

  async run() {
    const logs = [];
    const processedJobs = [];
    const permanentlyFailedIds = new Set();
    const effectiveMax = this.maxAmount === 0 ? Infinity : this.maxAmount;

    const rangeInfo = effectiveMax === Infinity
      ? `\u2265${Math.round(this.minAmount)}`
      : `${Math.round(this.minAmount)}\u2013${Math.round(effectiveMax)}`;

    try {
      // ── Step 1: Fetch app keys ──────────────────────────────
      logs.push('Initializing engine...');
      this._emit({ success: false, message: 'Starting...', status: 'Starting...', logs: [...logs], processed: 0, progress: 5 });

      let keys;
      try {
        keys = await this.client.fetchAppKeys();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Service initialization failed.';
        logs.push(message);
        this._emit({ success: false, message, status: message, logs, processed: 0, progress: 0 });
        return { success: false, message, logs, processed: 0 };
      }
      logs.push('Engine initialized.');
      this._emit({ success: false, message: 'Authenticating...', status: 'Authenticating...', logs: [...logs], processed: 0, progress: 10 });

      // ── Step 2: Use saved session token ─────────────────────
      if (!this.token) {
        this._emit({ success: false, message: 'No active session. Please reconnect your service workspace.', status: 'No active session. Please reconnect your service workspace.', logs, processed: 0, progress: 0 });
        return { success: false, message: 'No active session.', logs, processed: 0 };
      }
      logs.push('Using active session.');
      this._emit({ success: false, message: 'Preparing tasks...', status: 'Preparing tasks...', logs: [...logs], processed: 0, progress: 20 });

      // ── Step 3: Select payment tool ─────────────────────────
      logs.push('Configuring connectors...');
      const toolResult = await this.client.selectPaymentTool({
        appKey: keys.key,
        appSecret: keys.secret,
        token: this.token,
        preferredToolName: this.preferredToolName,
      });
      if (!toolResult.tool) {
        this._emit({ success: false, message: toolResult.error || 'Connector configuration failed.', status: toolResult.error || 'Connector configuration failed.', logs, processed: 0, progress: 0 });
        return { success: false, message: toolResult.error || 'Connector configuration failed.', logs, processed: 0 };
      }
      const selectedTool = toolResult.tool;
      logs.push(`Connector set: ${selectedTool.toolName}`);
      this._emit({ success: false, message: 'Scanning for tasks...', status: 'Scanning for tasks...', logs: [...logs], processed: 0, progress: 30 });

      // ── Step 4: FAST task processing ────────────────────────
      logs.push(`\u26a1 Fast-scan mode (Complexity ${this.minAmount} \u2013 ${effectiveMax === Infinity ? 'Any' : Math.round(effectiveMax)})`);

      let stopFlag = false;
      let listErrorCount = 0;
      let iteration = 0;

      while (processedJobs.length < this.targetCount && !stopFlag && !this.stopRequested) {
        iteration++;

        const listResult = await this.client.fetchTaskList({
          appKey: keys.key,
          appSecret: keys.secret,
          token: this.token,
        });

        const records = listResult.tasks;

        // ── Handle API errors ──
        if (listResult.error != null) {
          listErrorCount++;
          const errMsg = listResult.error || '';
          const isRateLimited = errMsg.toLowerCase().includes('too many request');

          if (listErrorCount % 10 === 1 || isRateLimited) {
            logs.push(`\u21bb API busy, retrying... (${errMsg})`);
            this._emit({
              success: false,
              message: `Scanning... (${processedJobs.length}/${this.targetCount})`,
              status: `Scanning... (${processedJobs.length}/${this.targetCount})`,
              logs: [...logs],
              processed: processedJobs.length,
              progress: 30 + (processedJobs.length / this.targetCount) * 60,
            });
          }
          if (listErrorCount >= 50) {
            logs.push('\u2717 Too many consecutive errors. Stopping.');
            stopFlag = true;
            break;
          }
          await sleep(isRateLimited ? 3000 : 100);
          continue;
        }
        listErrorCount = 0;

        // ── Empty result — human-like retry ──
        if (records.length === 0) {
          await sleep(humanDelay.emptyResult());
          continue;
        }

        // ── Filter tasks (client-side, like the Python script) ──
        const processedIds = new Set(processedJobs.map((o) => o.id));
        const tasksToProcess = [];
        let outOfRangeCount = 0;

        for (const item of records) {
          const taskId = item.orderId;
          const complexity = Number.parseFloat(String(item.amount ?? ''));
          const amount = Number.isNaN(complexity) ? 0 : complexity;

          if (taskId == null) continue;
          if (processedIds.has(taskId)) continue;
          if (permanentlyFailedIds.has(taskId)) continue;

          if (amount < this.minAmount || (effectiveMax !== Infinity && amount > effectiveMax)) {
            outOfRangeCount++;
            continue;
          }

          tasksToProcess.push({ id: taskId, complexity: amount });
          if (tasksToProcess.length >= 3) break;
        }

        // ── No matching tasks — fast retry ──
        if (tasksToProcess.length === 0) {
          if (iteration % 20 === 1) {
            const detail = records.length === 0
              ? 'No tasks in queue yet'
              : `Found ${records.length} task(s), ${outOfRangeCount} out-of-range for ${rangeInfo}`;
            logs.push(`\u21bb ${detail}. Scanning...`);
            this._emit({
              success: false,
              message: `Scanning (${processedJobs.length}/${this.targetCount}) \u2013 ${detail}`,
              status: `Scanning (${processedJobs.length}/${this.targetCount}) \u2013 ${detail}`,
              logs: [...logs],
              processed: processedJobs.length,
              progress: 30 + (processedJobs.length / this.targetCount) * 60,
            });
          }
          await sleep(humanDelay.betweenPolls());
          continue;
        }

        // ── GRAB: concurrent initialization + verification ──
        logs.push(`\u26a1 Found ${tasksToProcess.length} eligible action(s)! Grabbing...`);
        this._emit({
          success: false,
          message: `Grabbing ${tasksToProcess.length} task(s)...`,
          status: `Grabbing ${tasksToProcess.length} task(s)...`,
          logs: [...logs],
          processed: processedJobs.length,
          progress: 30 + (processedJobs.length / this.targetCount) * 60,
        });

        const results = [];
        for (let i = 0; i < tasksToProcess.length; i++) {
          const item = tasksToProcess[i];
          const initRes = await this.client.initializeTask({
            taskId: item.id,
            amount: item.complexity,
            selectedTool,
            appKey: keys.key,
            appSecret: keys.secret,
            token: this.token,
          });

          if (initRes && this.client.isSuccess(initRes)) {
            let realId = item.id;
            if (initRes.data && initRes.data.orderId) realId = initRes.data.orderId;

            // Human-like delay between init and verify
            await sleep(humanDelay.betweenBatchTasks());

            const verifyRes = await this.client.verifyTask({
              taskId: realId,
              appKey: keys.key,
              appSecret: keys.secret,
              token: this.token,
            });

            results.push({
              id: realId,
              complexity: item.complexity,
              initialized: true,
              verified: !!verifyRes && this.client.isSuccess(verifyRes),
            });
          } else {
            const failMsg = (initRes && initRes.msg ? String(initRes.msg) : '').toLowerCase();
            if (
              failMsg.includes('reach max') ||
              failMsg.includes('daily limit') ||
              failMsg.includes('maximum limit') ||
              failMsg.includes('cancellation/timeout')
            ) {
              permanentlyFailedIds.add(item.id);
            }
            const fallbackMsg = initRes
              ? initRes.msg || initRes.message || `Code: ${initRes.code}`
              : 'Link error';
            results.push({
              id: item.id,
              complexity: item.complexity,
              initialized: false,
              verified: false,
              msg: fallbackMsg,
            });
          }

          // Human-like delay between tasks
          if (i < tasksToProcess.length - 1) {
            await sleep(humanDelay.betweenTasks());
          }
        }

        // ── Process results ──
        for (const r of results) {
          if (r.initialized) {
            logs.push(`\u2713 Grabbed ${r.id} (\u20b9${r.complexity})`);
            if (r.verified) {
              logs.push('  \u2713 Verified!');
              if (!processedJobs.some((o) => o.id === r.id)) {
                processedJobs.push({ id: r.id, verified: true });
              }
            } else {
              logs.push('  \u2717 Verification failed.');
            }
          } else {
            const msg = String(r.msg || 'Sync collision');
            const msgLower = msg.toLowerCase();

            if (
              msgLower.includes('reach max') ||
              msgLower.includes('daily limit') ||
              msgLower.includes('maximum limit') ||
              msgLower.includes('cancellation/timeout')
            ) {
              logs.push('\u2717 Daily limit reached. Come back tomorrow!');
              stopFlag = true;
            } else {
              logs.push(`\u2717 ${r.id}: ${msg}`);
            }
          }
        }

        const successfulCount = processedJobs.filter((o) => o.verified).length;
        const progressPct = Math.min(100, 30 + (successfulCount / this.targetCount) * 70);
        this._emit({
          success: false,
          message: `Processing (${successfulCount}/${this.targetCount})...`,
          status: `Processing (${successfulCount}/${this.targetCount})...`,
          logs: [...logs],
          processed: successfulCount,
          progress: progressPct,
        });

        if (successfulCount >= this.targetCount) break;

        await sleep(0);
      }

      if (this.stopRequested) this.stopped = true;

      // ── Final result ──
      const successfulTasks = processedJobs
        .filter((o) => o.verified)
        .map((o) => ({ taskId: o.id }));

      const finalProcessedCount = successfulTasks.length;
      const msg =
        finalProcessedCount > 0
          ? `Done! Successfully processed ${finalProcessedCount}/${this.targetCount} actions.`
          : this.stopped
            ? 'Stopped by user.'
            : 'No actions were processed at this time.';

      this._emit({
        success: finalProcessedCount > 0,
        message: msg,
        status: msg,
        logs,
        processed: finalProcessedCount,
        progress: 100,
        processedTasks: successfulTasks,
      });

      return {
        success: finalProcessedCount > 0,
        message: msg,
        logs,
        processed: finalProcessedCount,
        processedTasks: successfulTasks,
      };
    } catch (err) {
      logs.push(`Technical error: ${err.message}`);
      this._emit({
        success: false,
        message: 'Process interrupted.',
        status: 'Process interrupted.',
        logs,
        processed: 0,
        progress: 0,
      });
      return { success: false, message: 'Process interrupted.', logs, processed: 0 };
    }
  }
}

module.exports = { GrabEngine };
