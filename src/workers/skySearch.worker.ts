/**
 * Web Worker for SearchBar2 — keystroke-driven search across the NotableStar
 * and Galaxy lists already loaded into the main thread.
 *
 * Indexed once at fetch resolution; subsequent queries lowercase the input,
 * walk the row list, score each row, and return the top 5 hits visibility-
 * filtered. `seq` tags let the main thread drop stale frames if an earlier
 * keystroke's results arrive after a later one's.
 *
 * `buildIndex` and `rankQuery` are exported so unit tests can exercise the
 * pipeline without spinning up an actual Worker. The block at the bottom
 * wires them to self.onmessage / self.postMessage.
 */

import type { NotableStar, Galaxy } from '../types';

export type SearchHit =
  | { kind: 'star';   star: NotableStar; rank: number }
  | { kind: 'galaxy'; galaxy: Galaxy;    rank: number };

export interface SearchIndex {
  rows: IndexedRow[];
}
interface IndexedRow {
  hit: SearchHit;
  fields: string[];      // all lowercased
  baseRank: number;      // small static bias (e.g. brightness for stars)
}

export interface Visibility {
  stars: boolean;
  galaxies: boolean;
}

const lc = (s: string | number | null | undefined): string =>
  s == null ? '' : String(s).toLowerCase().trim();

export function buildIndex(stars: NotableStar[], galaxies: Galaxy[]): SearchIndex {
  const rows: IndexedRow[] = [];

  for (const s of stars) {
    const fields = [s.name, s.proper_name, s.bayer_flamsteed, s.hd, s.hr, s.gliese]
      .map(lc)
      .filter(Boolean);
    if (fields.length === 0) continue;
    rows.push({
      hit: { kind: 'star', star: s, rank: 0 },
      fields,
      // Brighter stars get a small bonus so "vega" beats fainter Vega-ish names.
      baseRank: Math.max(0, 6 - s.mag) * 0.05,
    });
  }

  for (const g of galaxies) {
    const fields = [g.name, ...g.alt_names].map(lc).filter(Boolean);
    if (fields.length === 0) continue;
    rows.push({
      hit: { kind: 'galaxy', galaxy: g, rank: 0 },
      fields,
      baseRank: 0,
    });
  }

  return { rows };
}

function scoreField(field: string, q: string): number {
  if (!field) return 0;
  if (field.startsWith(q)) return 3.0;
  const tokens = field.split(/\s+/);
  for (const t of tokens) {
    if (t.startsWith(q)) return 2.5;
  }
  if (field.includes(q)) return 2.0;
  const qParts = q.split(/\s+/).filter(Boolean);
  if (qParts.length > 1) {
    const ok = qParts.every((part) => tokens.some((t) => t.startsWith(part)));
    if (ok) return 1.5;
  }
  return 0;
}

function rowScore(row: IndexedRow, q: string): number {
  let best = 0;
  for (const f of row.fields) {
    const s = scoreField(f, q);
    if (s > best) best = s;
  }
  return best > 0 ? best + row.baseRank : 0;
}

export function rankQuery(
  idx: SearchIndex,
  rawQuery: string,
  visibility: Visibility,
): { items: SearchHit[]; hiddenHitCount: number } {
  const q = lc(rawQuery);
  if (!q) return { items: [], hiddenHitCount: 0 };

  // Score every row; collect non-zero matches.
  const scored: { row: IndexedRow; score: number }[] = [];
  for (const row of idx.rows) {
    const s = rowScore(row, q);
    if (s > 0) scored.push({ row, score: s });
  }
  scored.sort((a, b) => b.score - a.score);

  const visible: SearchHit[] = [];
  let hiddenHitCount = 0;
  for (const { row, score } of scored) {
    const kindVisible =
      (row.hit.kind === 'star'   && visibility.stars) ||
      (row.hit.kind === 'galaxy' && visibility.galaxies);
    if (kindVisible) {
      if (visible.length < 5) visible.push({ ...row.hit, rank: score });
    } else {
      hiddenHitCount += 1;
    }
  }
  return { items: visible, hiddenHitCount };
}

// ─── Worker bootstrap ────────────────────────────────────────────────────

export interface SearchIndexMsg {
  type: 'index';
  stars: NotableStar[];
  galaxies: Galaxy[];
}
export interface SearchQueryMsg {
  type: 'query';
  seq: number;
  q: string;
  visibility: Visibility;
}
export interface SearchResultsMsg {
  type: 'results';
  seq: number;
  items: SearchHit[];
  hiddenHitCount: number;
}

// In a Worker scope, `self` exposes the dedicated worker globals. In a Vitest
// (jsdom) import the same identifier resolves to the window — guard so the
// bootstrap is a no-op during unit tests. The TS app config doesn't include
// "WebWorker" in lib, so we treat self as a plain message-passing channel
// rather than a typed DedicatedWorkerGlobalScope.
interface WorkerChannel {
  postMessage: (m: unknown) => void;
  onmessage: ((e: MessageEvent<unknown>) => void) | null;
  window?: unknown;
}
declare const self: WorkerChannel | undefined;
if (
  typeof self !== 'undefined' &&
  typeof self.postMessage === 'function' &&
  typeof self.window === 'undefined'
) {
  let index: SearchIndex = { rows: [] };
  self.onmessage = (e: MessageEvent<unknown>) => {
    const msg = e.data as SearchIndexMsg | SearchQueryMsg;
    if (msg.type === 'index') {
      index = buildIndex(msg.stars, msg.galaxies);
      return;
    }
    if (msg.type === 'query') {
      const r = rankQuery(index, msg.q, msg.visibility);
      const out: SearchResultsMsg = {
        type: 'results',
        seq: msg.seq,
        ...r,
      };
      (self as WorkerChannel).postMessage(out);
    }
  };
}
