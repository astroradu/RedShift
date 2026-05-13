import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';
import { invokeGetSystemLocation } from '../lib/tauri';
import { dispatch } from '../lib/notifications';
import type { LocationState } from '../types';

interface UseLocation {
  location: LocationState['location'];
  source: LocationState['source'];
  loaded: boolean;
  fetchingSystem: boolean;
  saveLocation: (lat: number, lng: number, source?: 'manual' | 'system') => Promise<boolean>;
  fetchSystemLocation: (opts?: { silent?: boolean }) => Promise<{ lat: number; lng: number } | null>;
}

interface SaveBody {
  lat: number;
  lng: number;
  source: 'manual' | 'system';
}

export function useLocation(): UseLocation {
  const [state, setState] = useState<LocationState>({ location: null, source: 'none' });
  const [loaded, setLoaded] = useState(false);
  const [fetchingSystem, setFetchingSystem] = useState(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    apiFetch<LocationState>('/api/location')
      .then(data => {
        if (cancelledRef.current) return;
        setState(data);
        setLoaded(true);
      })
      .catch((err: unknown) => {
        if (cancelledRef.current) return;
        setLoaded(true);
        dispatch('Error', err instanceof Error ? err.message : String(err));
      });
    return () => { cancelledRef.current = true; };
  }, []);

  const saveLocation = useCallback(async (
    lat: number,
    lng: number,
    source: 'manual' | 'system' = 'manual',
  ): Promise<boolean> => {
    try {
      const body: SaveBody = { lat, lng, source };
      const next = await apiFetch<LocationState>('/api/location', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setState(next);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      dispatch('Error', `Could not save location: ${msg}`);
      return false;
    }
  }, []);

  const fetchSystemLocation = useCallback(async (
    opts?: { silent?: boolean },
  ): Promise<{ lat: number; lng: number } | null> => {
    setFetchingSystem(true);
    try {
      const coords = await invokeGetSystemLocation();
      await saveLocation(coords.lat, coords.lng, 'system');
      return coords;
    } catch (err: unknown) {
      if (!opts?.silent) {
        const msg = err instanceof Error ? err.message : String(err);
        dispatch('Error', `Could not get system location: ${msg}`);
      }
      return null;
    } finally {
      setFetchingSystem(false);
    }
  }, [saveLocation]);

  return {
    location: state.location,
    source: state.source,
    loaded,
    fetchingSystem,
    saveLocation,
    fetchSystemLocation,
  };
}
