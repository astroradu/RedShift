import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeSSE } from '../lib/api';

interface SseState<P, D> {
  running: boolean;
  done: boolean;
  progress: P | null;
  result: D | null;
  error: string | null;
  start: (path: string, body: unknown) => void;
  reset: () => void;
}

export function useApiSSE<P, D>(): SseState<P, D> {
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [progress, setProgress] = useState<P | null>(null);
  const [result, setResult] = useState<D | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
    setDone(false);
    setProgress(null);
    setResult(null);
    setError(null);
  }, []);

  const start = useCallback((path: string, body: unknown) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setDone(false);
    setProgress(null);
    setResult(null);
    setError(null);

    void subscribeSSE<P, D>(path, body, {
      onProgress: (event) => setProgress(event),
      onDone: (event) => {
        setResult(event);
        setRunning(false);
        setDone(true);
      },
      onError: (err) => {
        setRunning(false);
        setError(err instanceof Error ? err.message : String(err));
      },
      signal: controller.signal,
    });
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  return { running, done, progress, result, error, start, reset };
}
