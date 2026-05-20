/**
 * Expanding search pill — closed = 26×26 icon; clicking expands a 240px
 * input leftwards. Search-as-you-type runs in `src/workers/skySearch.worker.ts`;
 * the `worker` instance is injected from SkyViewer2 so tests can substitute
 * a MockWorker.
 *
 * Results are filtered to the top 5 visible hits; when none match but hits
 * exist outside the current visibility, the empty-state copy switches to a
 * hint that the Stars/Galaxies layers may be hidden.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../icons/Icon';
import { STRINGS } from '../../../lib/strings';
import type {
  SearchHit,
  SearchQueryMsg,
  SearchResultsMsg,
} from '../../../workers/skySearch.worker';

interface Props {
  worker: Worker;
  /** Visibility passed as primitives so a parent's `{stars, galaxies}`
   *  object literal can't churn the query-post effect on every render. */
  starsVisible: boolean;
  galaxiesVisible: boolean;
  onPick: (hit: SearchHit) => void;
}

const S = STRINGS.SKY2;

export function SearchBar2({ worker, starsVisible, galaxiesVisible, onPick }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<SearchHit[]>([]);
  const [hiddenHitCount, setHiddenHitCount] = useState(0);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const seqRef = useRef(0);
  const latestSeqRef = useRef(0);

  useEffect(() => {
    const onMsg = (e: MessageEvent<SearchResultsMsg>) => {
      const msg = e.data;
      if (!msg || msg.type !== 'results') return;
      if (msg.seq < latestSeqRef.current) return;
      latestSeqRef.current = msg.seq;
      setItems(msg.items);
      setHiddenHitCount(msg.hiddenHitCount);
    };
    worker.addEventListener('message', onMsg);
    return () => worker.removeEventListener('message', onMsg);
  }, [worker]);

  useEffect(() => {
    if (!open) return;
    const seq = ++seqRef.current;
    const msg: SearchQueryMsg = {
      type: 'query', seq, q: query,
      visibility: { stars: starsVisible, galaxies: galaxiesVisible },
    };
    worker.postMessage(msg);
  }, [query, starsVisible, galaxiesVisible, open, worker]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAndClear();
    };
    const onDown = (e: PointerEvent) => {
      const el = wrapRef.current;
      if (el && !el.contains(e.target as Node)) closeAndClear();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  const closeAndClear = () => {
    setOpen(false);
    setQuery('');
    setItems([]);
    setHiddenHitCount(0);
  };

  const showEmptyHidden = useMemo(
    () => open && query.length > 0 && items.length === 0 && hiddenHitCount > 0,
    [open, query, items, hiddenHitCount],
  );
  const showEmptyNoMatches = useMemo(
    () => open && query.length > 0 && items.length === 0 && hiddenHitCount === 0,
    [open, query, items, hiddenHitCount],
  );

  return (
    <div className={'sky2-search' + (open ? ' open' : '')} ref={wrapRef}>
      <div className="sky2-ss-expand" aria-hidden={!open}>
        <button
          type="button"
          className="sky2-ss-clear"
          onClick={closeAndClear}
          aria-label={S.SEARCH_CLEAR_ARIA}
          tabIndex={open ? 0 : -1}
        >
          <Icon name="x" size={11} />
        </button>
        <input
          ref={inputRef}
          className="sky2-ss-input"
          placeholder={S.SEARCH_PLACEHOLDER}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          tabIndex={open ? 0 : -1}
        />
      </div>
      <button
        type="button"
        className={'sky2-tog sky2-tog-ic sky2-ss-btn' + (open ? ' on' : '')}
        onClick={() => {
          if (open) inputRef.current?.focus();
          else setOpen(true);
        }}
        aria-label={S.SEARCH_ARIA}
        aria-expanded={open}
      >
        <Icon name="search" size={15} stroke={1.5} />
        {!open && <span className="sky2-tog-hint">{S.SEARCH_HINT}</span>}
      </button>

      {open && (query.length > 0 || items.length > 0) && (
        <div className="sky2-ss-results" role="listbox">
          {showEmptyNoMatches && (
            <div className="sky2-ss-empty">
              {interpQ(S.SEARCH_EMPTY_NO_MATCHES, query)}
            </div>
          )}
          {showEmptyHidden && (
            <div className="sky2-ss-empty">
              {interpQ(S.SEARCH_EMPTY_HIDDEN, query)}
            </div>
          )}
          {items.length > 0 && (
            <>
              <div className="sky2-ss-results-head">{S.SEARCH_RESULTS_HEAD}</div>
              {items.map((hit) => (
                <button
                  type="button"
                  key={hit.kind === 'star' ? `s-${hit.star.id}` : `g-${hit.galaxy.id}`}
                  className="sky2-ss-result"
                  role="option"
                  aria-selected={false}
                  onClick={() => {
                    onPick(hit);
                    closeAndClear();
                  }}
                >
                  <span className={'sky2-ss-kind ' + hit.kind} aria-hidden="true">
                    <Icon
                      name={hit.kind === 'galaxy' ? 'layer-galaxies' : 'layer-stars'}
                      size={13}
                    />
                  </span>
                  <span className="sky2-ss-text">
                    <span className="sky2-ss-name">
                      {hit.kind === 'star' ? hit.star.name : hit.galaxy.name}
                    </span>
                    <span className="sky2-ss-sub">{subFor(hit)}</span>
                  </span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Safe {q} interpolation — callback form sidesteps JS's $&/$1 patterns in
 *  user input. */
function interpQ(template: string, q: string): string {
  return template.replace(/\{q\}/g, () => q);
}

function subFor(hit: SearchHit): string {
  const SEP = S.SEARCH_RESULT_SEP;
  if (hit.kind === 'star') {
    const s = hit.star;
    const parts: string[] = [];
    if (s.bayer_flamsteed) parts.push(s.bayer_flamsteed);
    if (Number.isFinite(s.mag)) parts.push(`${S.SEARCH_RESULT_MAG} ${s.mag.toFixed(2)}`);
    return parts.join(SEP);
  }
  const g = hit.galaxy;
  const parts: string[] = [];
  if (g.alt_names.length > 0) parts.push(g.alt_names[0]);
  if (g.mag != null) parts.push(`${S.SEARCH_RESULT_MAG} ${g.mag.toFixed(1)}`);
  return parts.join(SEP);
}
