import { useEffect, useRef, useState } from 'react';
import type { TaskResult } from './types';
import { getToken, getActiveProvider } from './storage';
import { api } from './api';

/**
 * Server-side engine controller. [start] POSTs to the backend to begin a run,
 * then subscribes to the SSE stream for progress. Progress + final result are
 * surfaced through [onEvent].
 */
export function useEngineStream() {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const esRef = useRef<EventSource | null>(null);
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

  const start = async (
    input: { minAmount: number; maxAmount: number; targetCount: number; preferredToolName: string },
    onEvent: (r: TaskResult) => void,
  ): Promise<{ success: boolean; error?: string }> => {
    onEventRef.current = onEvent;
    setRunning(true);
    setProgress(0);
    setStatus('Initializing...');
    setLogs([]);

    try {
      const token = getToken();
      const provider = getActiveProvider() || 'incoin';
      const appKeys = provider === 'incoin' ? await api.getIncoinAppKeys() : undefined;
      const res = await fetch('/api/incoin/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({
          ...input,
          provider,
          ...(appKeys ? { appKey: appKeys.key, appSecret: appKeys.secret } : {}),
        }),
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
      const message = e instanceof Error ? e.message : 'Failed to start.';
      setStatus(message);
      return { success: false, error: message };
    }
  };

  const stop = async () => {
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

  useEffect(() => close, []);

  return { running, progress, status, logs, start, stop };
}
