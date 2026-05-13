import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';
import { dispatch } from '../lib/notifications';
import { STRINGS } from '../lib/strings';
import type { AppSettings } from '../types';

interface UseSettings {
  settings: AppSettings | null;
  loaded: boolean;
  updateSettings: (partial: Partial<AppSettings>) => Promise<boolean>;
}

export function useSettings(): UseSettings {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loaded, setLoaded] = useState(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    apiFetch<AppSettings>('/api/settings')
      .then(data => {
        if (cancelledRef.current) return;
        setSettings(data);
        setLoaded(true);
      })
      .catch((err: unknown) => {
        if (cancelledRef.current) return;
        setLoaded(true);
        dispatch('Error', err instanceof Error ? err.message : String(err));
      });
    return () => { cancelledRef.current = true; };
  }, []);

  const updateSettings = useCallback(async (partial: Partial<AppSettings>): Promise<boolean> => {
    try {
      const next = await apiFetch<AppSettings>('/api/settings', {
        method: 'PATCH',
        body: JSON.stringify(partial),
      });
      setSettings(next);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      dispatch('Error', STRINGS.SETTINGS.errSave(msg));
      return false;
    }
  }, []);

  return { settings, loaded, updateSettings };
}
