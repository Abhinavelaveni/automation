import { useEffect, useRef, useState } from 'react';
import type { TaskResult } from './types';
import { getToken, getActiveProvider } from './storage';
import { api } from './api';
import { fetchAppKeys } from './incoinBrowser';
import { BrowserGrabEngine } from './browserEngine';

/**
 * Engine controller.
 *  - Incoin: the grab loop runs in this browser (so Incoin sees the user's own
 *    network). The backend only reserves the run and charges the credit.
 *  - PakkaGo: unchanged — the backend runs the loop and streams progress (SSE).
 * Progress + final result are surfaced through [onEvent].
 */
export function useEngineStream() {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const esRef = useRef<EventSource | null>(null);
  const browserEngineRef = useRef<BrowserGrabEngine | null>(null);
  const onEventRef = useRef<((r: TaskResult) => void) | null>(null);

  const close = () => {
    esRef.current?.close();
    esRef.current = null;
  };

  const openStream = (token: string) => {
    close();
    const es = new EventSource(`/api/incoin/stream?token=${encodeURIComponent(token)}`);

    es.addEventListener('progress', (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as TaskResult;
        setProgress(data.progress);
        setStatus(data.status || data.message);
        setLogs(data.logs);
        onEventRef.current?.({ ...data, done: false });
      } catch {
        /* ignore malformed event */
      }
    });

    es.addEventListener('done', (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as TaskResult;
        setProgress(100);
        setStatus(data.message);
        setLogs(data.logs);
        setRunning(false);
        onEventRef.current?.({ ...data, done: true });
      } catch {
        /* ignore */
      } finally {
        close();
      }
    });

    es.addEventListener('stopped', () => {
      setRunning(false);
      setStatus('Stopped.');
      close();
    });

    esRef.current = es;
  };

  const startInBrowser = async (
    input: { minAmount: number; maxAmount: number; targetCount: number; preferredToolName: string },
  ): Promise<{ success: boolean; error?: string }> => {
    const session = await api.incoinSession({ targetCount: input.targetCount });
    if (!session.success || !session.token) {
      setRunning(false);
      setStatus(session.error || 'Failed to start.');
      return { success: false, error: session.error || 'Failed to start.' };
    }

    let keys;
    try {
      keys = await fetchAppKeys();
    } catch (e) {
      await api.completeIncoinRun(0); // release the reserved run
      const msg = e instanceof Error ? e.message : 'Could not reach Incoin.';
      setRunning(false);
      setStatus(msg);
      return { success: false, error: msg };
    }

    const engine = new BrowserGrabEngine({
      token: session.token,
      keys,
      minAmount: input.minAmount,
      maxAmount: input.maxAmount,
      targetCount: session.targetCount || input.targetCount,
      preferredToolName: input.preferredToolName,
      onEvent: (ev) => {
        setProgress(ev.progress);
        setStatus(ev.status || ev.message);
        setLogs(ev.logs);
        onEventRef.current?.({ ...ev, done: false });
      },
    });
    browserEngineRef.current = engine;

    void engine.run().then(async (result) => {
      browserEngineRef.current = null;
      await api.completeIncoinRun(result.processed); // charge credit before UI refresh
      setProgress(100);
      setStatus(result.message);
      setLogs(result.logs);
      setRunning(false);
      onEventRef.current?.({
        success: result.success,
        message: result.message,
        logs: result.logs,
        processed: result.processed,
        progress: 100,
        processedTasks: result.processedTasks,
        done: true,
      });
    });

    return { success: true };
  };

  const start = async (
    input: { minAmount: number; maxAmount: number; targetCount: number; preferredToolName: string },
    onEvent: (r: TaskResult) => void,
  ): Promise<{ success: boolean; error?: string }> => {
    onEventRef.current = onEvent;
    setRunning(true);
    setProgress(0);
    setStatus('Initializing...');
    setLogs([]);

    if ((getActiveProvider() || 'incoin') === 'incoin') {
      return startInBrowser(input);
    }

    try {
      const token = getToken();
      const res = await fetch('/api/incoin/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({ ...input, provider: getActiveProvider() || 'incoin' }),
      });
      const data = await res.json();
      if (!data?.success) {
        setRunning(false);
        setStatus(data?.error || 'Failed to start.');
        return { success: false, error: data?.error || 'Failed to start.' };
      }
      openStream(token || '');
      return { success: true };
    } catch (e) {
      setRunning(false);
      setStatus('Failed to start.');
      return { success: false, error: 'Failed to start.' };
    }
  };

  const stop = async () => {
    if (browserEngineRef.current) {
      browserEngineRef.current.stop();
      setStatus('Stopping...');
      return;
    }
    const token = getToken();
    try {
      await fetch('/api/incoin/stop', {
        method: 'POST',
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
        },
      });
      setRunning(false);
      setStatus('Stopping...');
    } catch (e) {
      console.error('Failed to stop:', e);
    }
  };

  useEffect(
    () => () => {
      close();
      browserEngineRef.current?.stop();
    },
    [],
  );

  return { running, progress, status, logs, start, stop };
}
