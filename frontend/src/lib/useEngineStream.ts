import { useEffect, useRef, useState } from 'react';
import type { TaskResult } from './types';
import { getActiveProvider } from './storage';
import { api } from './api';

/**
 * Starts a persistent backend run and polls its MongoDB-backed state.
 */
export function useEngineStream() {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollInFlightRef = useRef(false);
  const lastEventRef = useRef('');
  const onEventRef = useRef<((r: TaskResult) => void) | null>(null);

  const close = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  };

  const pollRun = async (provider: 'incoin' | 'pakkago') => {
    if (pollInFlightRef.current) return;
    pollInFlightRef.current = true;
    try {
      const state = await api.getEngineState(provider);
      const currentLogs = state.logs || [];
      setProgress(state.progress);
      setStatus(state.status);
      setLogs(currentLogs);

      const terminal = ['completed', 'stopped', 'failed'].includes(state.runStatus || '');
      const eventKey = JSON.stringify([
        state.runStatus,
        state.status,
        state.progress,
        currentLogs,
      ]);
      if (state.runStatus && (eventKey !== lastEventRef.current || terminal)) {
        lastEventRef.current = eventKey;
        onEventRef.current?.({
          success: !!state.success,
          message: state.status,
          status: state.status,
          logs: currentLogs,
          processed: state.processed,
          progress: state.progress,
          processedTasks: state.processedTasks || [],
          done: terminal,
        });
      }

      if (terminal) {
        setRunning(false);
        close();
      }
    } finally {
      pollInFlightRef.current = false;
    }
  };

  const start = async (
    input: { minAmount: number; maxAmount: number; targetCount: number; preferredToolName: string },
    onEvent: (r: TaskResult) => void,
  ): Promise<{ success: boolean; error?: string }> => {
    onEventRef.current = onEvent;
    setRunning(true);
    setProgress(0);
    setStatus('Queuing run...');
    setLogs([]);
    lastEventRef.current = '';

    try {
      const result = await api.startEngine(input);
      if (!result.success) {
        setRunning(false);
        setStatus(result.error || 'Failed to start.');
        return { success: false, error: result.error || 'Failed to start.' };
      }

      const provider = getActiveProvider() || 'incoin';
      close();
      setStatus('Queued for processing. Runs are picked up by the scheduled worker.');
      pollRef.current = setInterval(() => void pollRun(provider), 3000);
      void pollRun(provider);
      return { success: true };
    } catch {
      setRunning(false);
      setStatus('Failed to start.');
      return { success: false, error: 'Failed to start.' };
    }
  };

  const stop = async () => {
    const result = await api.stopEngine();
    if (result.success) setStatus('Stopping...');
  };

  useEffect(() => close, []);

  return { running, progress, status, logs, start, stop };
}
