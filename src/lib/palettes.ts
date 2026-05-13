import { apiFetch } from './api';
import type { Mode, Palette } from '../types';

let palettesCache: Palette[] | null = null;
let palettesPromise: Promise<Palette[]> | null = null;

export function loadPalettes(): Promise<Palette[]> {
  if (palettesCache) return Promise.resolve(palettesCache);
  if (!palettesPromise) {
    palettesPromise = apiFetch<Palette[]>('/api/palettes').then((data) => {
      palettesCache = data;
      return data;
    });
  }
  return palettesPromise;
}

export function getCachedPalettes(): Palette[] | null {
  return palettesCache;
}

export function applyPalette(paletteId: string, mode: Mode): void {
  const cache = palettesCache;
  if (!cache || cache.length === 0) {
    console.warn('applyPalette called before palettes loaded; using CSS defaults');
    return;
  }
  const palette = cache.find((p) => p.id === paletteId) ?? cache[0];
  const vars = palette[mode];
  const decls = (Object.entries(vars) as [string, string][])
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
  let style = document.getElementById('palette-vars') as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = 'palette-vars';
    document.head.appendChild(style);
  }
  style.textContent = `:root {\n${decls}\n}`;
  document.documentElement.setAttribute('data-mode', mode);
  document.documentElement.setAttribute('data-palette', paletteId);
}
