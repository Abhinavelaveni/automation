import * as incoin from './incoinBrowser';
import type { TaskResult } from './types';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const randomDelay = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

const humanDelay = {
  betweenPolls: () => randomDelay(1000, 2500),
  betweenTasks: () => randomDelay(1500, 3500),
  betweenBatchTasks: () => randomDelay(500, 1500),
  emptyResult: () => randomDelay(800, 2000),
};

const LIMIT_MARKERS = ['reach max', 'daily limit', 'maximum limit', 'cancellation/timeout'];
const isLimitMessage = (msg: string) => LIMIT_MARKERS.some((m) => msg.toLowerCase().includes(m));

export interface EngineResult {
  success: boolean;
  message: string;
  logs: string[];
  processed: number;
  processedTasks: { taskId: string }[];
  stopped: boolean;
}

interface Options {
  token: string;
  keys: incoin.AppKeys;
  minAmount: number;
  maxAmount: number;
  targetCount: number;
  preferredToolName?: string;
  onEvent: (ev: TaskResult) => void;
}

/**
 * Runs the Incoin grab loop inside the user's browser. Network calls to
 * api.incoinpay.net therefore come from the user's own connection, the same
 * as the working dashboard, instead of from the hosting provider's datacenter.
 */
export class BrowserGrabEngine {
  private stopRequested = false;
  private readonly o: Options;

  constructor(options: Options) {
    this.o = options;
  }

  stop() {
    this.stopRequested = true;
  }

  private emit(
    logs: string[],
    message: string,
    processed: number,
    progress: number,
    processedTasks: { taskId: string }[] = [],
    success = false,
  ) {
    this.o.onEvent({ success, message, status: message, logs: [...logs], processed, progress, processedTasks });
  }

  async run(): Promise<EngineResult> {
    const { token, keys, minAmount, targetCount } = this.o;
    const effectiveMax = this.o.maxAmount === 0 ? Infinity : this.o.maxAmount;
    const logs: string[] = [];
    const processedJobs: { id: unknown; verified: boolean }[] = [];
    const permanentlyFailedIds = new Set<unknown>();
    let lastError = '';

    const fail = (message: string): EngineResult => {
      logs.push(message);
      this.emit(logs, message, 0, 0);
      return { success: false, message, logs, processed: 0, processedTasks: [], stopped: false };
    };

    try {
      logs.push('Initializing engine...');
      this.emit(logs, 'Starting...', 0, 5);
      logs.push('Engine initialized.');
      this.emit(logs, 'Preparing tasks...', 0, 20);

      logs.push('Configuring connectors...');
      const toolResult = await incoin.selectPaymentTool({
        keys,
        token,
        preferredToolName: this.o.preferredToolName || 'Freecharge',
      });
      if (!toolResult.tool) return fail(toolResult.error || 'Connector configuration failed.');
      const tool = toolResult.tool;
      logs.push(`Connector set: ${tool.toolName}`);
      this.emit(logs, 'Scanning for tasks...', 0, 30);
      logs.push(
        `\u26a1 Fast-scan mode (Complexity ${minAmount} \u2013 ${effectiveMax === Infinity ? 'Any' : Math.round(effectiveMax)})`,
      );

      let stopFlag = false;
      let listErrorCount = 0;
      let iteration = 0;
      const progressOf = (n: number) => 30 + (n / targetCount) * 60;

      while (processedJobs.length < targetCount && !stopFlag && !this.stopRequested) {
        iteration++;

        const list = await incoin.fetchTaskList({ keys, token });

        if (list.error != null) {
          lastError = list.error;
          if (list.authExpired) {
            logs.push('\u2717 Incoin session expired. Please reconnect your workspace.');
            break;
          }
          listErrorCount++;
          const rateLimited = list.error.toLowerCase().includes('too many request');
          if (listErrorCount % 10 === 1 || rateLimited) {
            logs.push(`\u21bb API busy, retrying... (${list.error})`);
            this.emit(
              logs,
              `Scanning... (${processedJobs.length}/${targetCount})`,
              processedJobs.length,
              progressOf(processedJobs.length),
            );
          }
          if (listErrorCount >= 50) {
            logs.push(`\u2717 Too many consecutive errors. Stopping. Last error: ${lastError}`);
            break;
          }
          await sleep(rateLimited ? 3000 : 100);
          continue;
        }
        listErrorCount = 0;

        const records = list.tasks;
        if (records.length === 0) {
          await sleep(humanDelay.emptyResult());
          continue;
        }

        const doneIds = new Set(processedJobs.map((j) => j.id));
        const toProcess: { id: unknown; complexity: number }[] = [];
        let outOfRange = 0;

        for (const item of records) {
          const id = item.orderId;
          const parsed = Number.parseFloat(String(item.amount ?? ''));
          const amount = Number.isNaN(parsed) ? 0 : parsed;
          if (id == null || doneIds.has(id) || permanentlyFailedIds.has(id)) continue;
          if (amount < minAmount || (effectiveMax !== Infinity && amount > effectiveMax)) {
            outOfRange++;
            continue;
          }
          toProcess.push({ id, complexity: amount });
          if (toProcess.length >= 3) break;
        }

        if (toProcess.length === 0) {
          if (iteration % 20 === 1) {
            const range = effectiveMax === Infinity ? `\u2265${Math.round(minAmount)}` : `${Math.round(minAmount)}\u2013${Math.round(effectiveMax)}`;
            const detail = `Found ${records.length} task(s), ${outOfRange} out-of-range for ${range}`;
            logs.push(`\u21bb ${detail}. Scanning...`);
            this.emit(
              logs,
              `Scanning (${processedJobs.length}/${targetCount}) \u2013 ${detail}`,
              processedJobs.length,
              progressOf(processedJobs.length),
            );
          }
          await sleep(humanDelay.betweenPolls());
          continue;
        }

        logs.push(`\u26a1 Found ${toProcess.length} eligible action(s)! Grabbing...`);
        this.emit(logs, `Grabbing ${toProcess.length} task(s)...`, processedJobs.length, progressOf(processedJobs.length));

        for (let i = 0; i < toProcess.length; i++) {
          if (this.stopRequested) break;
          const item = toProcess[i];
          const initRes = await incoin.initializeTask({ taskId: item.id, tool, keys, token });

          if (incoin.isSuccess(initRes)) {
            const realId = initRes.data?.orderId ?? item.id;
            await sleep(humanDelay.betweenBatchTasks());
            const verifyRes = await incoin.verifyTask({ taskId: realId, keys, token });
            logs.push(`\u2713 Grabbed ${realId} (\u20b9${item.complexity})`);
            if (incoin.isSuccess(verifyRes)) {
              logs.push('  \u2713 Verified!');
              if (!processedJobs.some((j) => j.id === realId)) processedJobs.push({ id: realId, verified: true });
            } else {
              logs.push('  \u2717 Verification failed.');
            }
          } else {
            const msg = String(initRes?.msg || initRes?.message || `Code: ${initRes?.code}`);
            lastError = msg;
            if (isLimitMessage(msg)) {
              permanentlyFailedIds.add(item.id);
              logs.push('\u2717 Daily limit reached. Come back tomorrow!');
              stopFlag = true;
              break;
            }
            logs.push(`\u2717 ${item.id}: ${msg}`);
          }

          if (i < toProcess.length - 1) await sleep(humanDelay.betweenTasks());
        }

        const ok = processedJobs.length;
        this.emit(logs, `Processing (${ok}/${targetCount})...`, ok, Math.min(100, 30 + (ok / targetCount) * 70));
        if (ok >= targetCount) break;
        await sleep(0);
      }

      const processedTasks = processedJobs.map((j) => ({ taskId: String(j.id) }));
      const count = processedTasks.length;
      const stopped = this.stopRequested;
      let message: string;
      if (count > 0) message = `Done! Successfully processed ${count}/${targetCount} actions.`;
      else if (stopped) message = 'Stopped by user.';
      else if (lastError) message = `No actions were processed. Last error: ${lastError}`;
      else message = 'No actions were processed at this time.';

      this.emit(logs, message, count, 100, processedTasks, count > 0);
      return { success: count > 0, message, logs, processed: count, processedTasks, stopped };
    } catch (err) {
      const message = `Technical error: ${err instanceof Error ? err.message : String(err)}`;
      logs.push(message);
      this.emit(logs, 'Process interrupted.', 0, 0);
      return { success: false, message: 'Process interrupted.', logs, processed: 0, processedTasks: [], stopped: false };
    }
  }
}
