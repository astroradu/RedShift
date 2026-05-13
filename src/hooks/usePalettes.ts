import { useEffect, useState } from 'react';
import { loadPalettes } from '../lib/palettes';
import type { Palette } from '../types';

interface UsePalettes {
  palettes: Palette[];
  loading: boolean;
  error: string | null;
}

export function usePalettes(): UsePalettes {
  const [palettes, setPalettes] = useState<Palette[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadPalettes()
      .then((data) => {
        if (!cancelled) {
          setPalettes(data);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  return { palettes, loading, error };
}
