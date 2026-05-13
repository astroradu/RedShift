import { useEffect, useState } from 'react';
import { getBackend } from '../lib/api';

export type BackendStatus = 'pending' | 'ready' | 'error';

interface BackendReady {
  status: BackendStatus;
  error: string | null;
}

export function useBackendReady(): BackendReady {
  const [status, setStatus] = useState<BackendStatus>('pending');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getBackend()
      .then(() => {
        if (!cancelled) setStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStatus('error');
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { status, error };
}
