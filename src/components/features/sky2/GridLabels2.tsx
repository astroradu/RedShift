import { type MutableRefObject, useEffect, useMemo, useRef } from 'react';
import { projectWorldToScreen, type ProjModeNum, type ScreenPoint } from './projection';
import { altAzToXyz } from './starsData';
import type { SceneView } from './particleScene';

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

// Alt rings every 10° (major; always visible) plus every 5° offset (fine;
// fade in when zoomed past ~50° FOV). Above-horizon only — below-horizon is
// covered by the ground veil.
const ALT_MAJOR_DEG = [10, 20, 30, 40, 50, 60, 70, 80];
const ALT_FINE_DEG  = [ 5, 15, 25, 35, 45, 55, 65, 75];

// Az meridians every 10° (major) / 5° offset (fine). az IS the compass
// bearing directly under our convention (az=0 → N, az=90 → E, etc.).
const RA_MAJOR_DEG: number[] = [];
const RA_FINE_DEG: number[]  = [];
for (let d = 0; d < 360; d += 10) RA_MAJOR_DEG.push(d);
for (let d = 5; d < 360; d += 10) RA_FINE_DEG.push(d);

// Threshold beyond which fine labels fade in. Mirrors the grid shader's
// uFineOpacity ramp in particleScene.ts::setFov (50→40 smoothstep window).
const FINE_FADE_FOV = 50;

interface Props {
  wrapRef: MutableRefObject<HTMLDivElement | null>;
  getView: () => SceneView | null;
  show: boolean;
  /** Current FOV in degrees — used to toggle the fine-label fade. */
  fovDeg: number;
}

interface LabelEntry {
  text: string;
  kind: 'dec-left' | 'dec-right' | 'ra-bottom';
  fine: boolean;
}

export function GridLabels2({ wrapRef, getView, show, fovDeg }: Props) {
  // Iteration order is load-bearing: the tick loop must visit Dec rings in the
  // same order as `entries` builds them, so the cursor index lines up with
  // nodeRefs[i]. We build [...DEC_MAJOR, ...DEC_FINE] then [...RA_MAJOR, ...RA_FINE].
  const entries = useMemo<LabelEntry[]>(() => {
    const list: LabelEntry[] = [];
    for (const a of ALT_MAJOR_DEG) {
      list.push({ text: `${a}°`, kind: 'dec-left',  fine: false });
      list.push({ text: `${a}°`, kind: 'dec-right', fine: false });
    }
    for (const a of ALT_FINE_DEG) {
      list.push({ text: `${a}°`, kind: 'dec-left',  fine: true });
      list.push({ text: `${a}°`, kind: 'dec-right', fine: true });
    }
    // az IS the compass bearing (observer-frame grid).
    for (const azDeg of RA_MAJOR_DEG) {
      list.push({ text: `${azDeg}°`, kind: 'ra-bottom', fine: false });
    }
    for (const azDeg of RA_FINE_DEG) {
      list.push({ text: `${azDeg}°`, kind: 'ra-bottom', fine: true });
    }
    return list;
  }, []);

  const nodeRefs = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    if (!show) return;
    let raf = 0;
    const tick = () => {
      const wrap = wrapRef.current;
      const view = getView();
      if (wrap && view) {
        const W = wrap.clientWidth;
        const H = wrap.clientHeight;
        const args = {
          yaw: view.yaw, pitch: view.pitch, fovDeg: view.fovDeg,
          projMode: view.projMode as ProjModeNum,
          viewportW: W, viewportH: H,
        };

        const RING_SAMPLES = 90;
        const MERIDIAN_SAMPLES = 45;
        const EDGE_INSET = 6;

        let cursor = 0;
        // Alt rings — must iterate [major..., fine...] in the same order as
        // `entries` for cursor alignment.
        for (const altDeg of [...ALT_MAJOR_DEG, ...ALT_FINE_DEG]) {
          const altRad = altDeg * DEG;
          const samples: (ScreenPoint | null)[] = new Array(RING_SAMPLES);
          for (let i = 0; i < RING_SAMPLES; i++) {
            const az = (i / RING_SAMPLES) * TAU;
            samples[i] = projectWorldToScreen(altAzToXyz(altRad, az, 420), args);
          }
          applyEdge(
            nodeRefs.current[cursor++],
            findEdgeCrossing(samples, 'left', W, H) ?? findExtremeVisible(samples, 'left'),
            W, H, 'left', EDGE_INSET,
          );
          applyEdge(
            nodeRefs.current[cursor++],
            findEdgeCrossing(samples, 'right', W, H) ?? findExtremeVisible(samples, 'right'),
            W, H, 'right', EDGE_INSET,
          );
        }
        for (const azDeg of [...RA_MAJOR_DEG, ...RA_FINE_DEG]) {
          const azRad = azDeg * DEG;
          const samples: (ScreenPoint | null)[] = new Array(MERIDIAN_SAMPLES);
          for (let i = 0; i < MERIDIAN_SAMPLES; i++) {
            const altRad = (i / MERIDIAN_SAMPLES) * 89 * DEG;
            samples[i] = projectWorldToScreen(altAzToXyz(altRad, azRad, 420), args);
          }
          applyEdge(
            nodeRefs.current[cursor++],
            findEdgeCrossing(samples, 'bottom', W, H),
            W, H, 'bottom', EDGE_INSET,
          );
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [show, wrapRef, getView]);

  if (!show) return null;
  const fineOn = fovDeg <= FINE_FADE_FOV ? '1' : '0';
  return (
    <div className="sky2-grid-labels" aria-hidden="true" data-fine-on={fineOn}>
      {entries.map((e, i) => (
        <span
          key={`${i}-${e.kind}-${e.text}`}
          ref={(el) => {
            nodeRefs.current[i] = el;
          }}
          className={`sky2-gl sky2-gl-${e.kind}${e.fine ? ' sky2-gl-fine' : ''}`}
        >
          {e.text}
        </span>
      ))}
    </div>
  );
}

function findEdgeCrossing(
  samples: (ScreenPoint | null)[],
  edge: 'left' | 'right' | 'bottom',
  W: number,
  H: number,
): { x: number; y: number } | null {
  const outsideOf = (p: ScreenPoint) => {
    if (edge === 'left')   return p.x < 0;
    if (edge === 'right')  return p.x > W;
    return p.y > H;
  };

  let best: { x: number; y: number; centerness: number } | null = null;
  for (let i = 0; i < samples.length; i++) {
    const a = samples[i];
    const b = samples[(i + 1) % samples.length];
    if (!a || !b || !a.visible || !b.visible) continue;
    const aOut = outsideOf(a);
    const bOut = outsideOf(b);
    if (aOut === bOut) continue;

    let t = 0.5;
    if (edge === 'left')   t = (0 - a.x) / (b.x - a.x);
    if (edge === 'right')  t = (W - a.x) / (b.x - a.x);
    if (edge === 'bottom') t = (H - a.y) / (b.y - a.y);
    t = Math.max(0, Math.min(1, t));

    const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    const centerness = edge === 'bottom'
      ? Math.abs(p.x - W / 2)
      : Math.abs(p.y - H / 2);

    if (!best || centerness < best.centerness) best = { ...p, centerness };
  }
  return best ? { x: best.x, y: best.y } : null;
}

// Fallback used when a curve has no viewport-edge crossing (fully visible
// inside the viewport). Returns the sample closest to the requested edge:
//   - 'left'   → smallest screen x
//   - 'right'  → largest screen x
//   - 'bottom' → largest screen y
function findExtremeVisible(
  samples: (ScreenPoint | null)[],
  edge: 'left' | 'right' | 'bottom',
): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestScore = Infinity;
  for (const s of samples) {
    if (!s || !s.visible) continue;
    const score = edge === 'left' ? s.x : edge === 'right' ? -s.x : -s.y;
    if (score < bestScore) {
      bestScore = score;
      best = { x: s.x, y: s.y };
    }
  }
  return best;
}

function applyEdge(
  node: HTMLSpanElement | null,
  pt: { x: number; y: number } | null,
  W: number,
  H: number,
  edge: 'left' | 'right' | 'bottom',
  inset: number,
): void {
  if (!node) return;
  if (!pt) { node.style.display = 'none'; return; }
  node.style.display = '';
  let tx = pt.x, ty = pt.y;
  if (edge === 'left')   tx = inset;
  if (edge === 'right')  tx = W - inset;
  if (edge === 'bottom') ty = H - inset;
  if (edge === 'left' || edge === 'right') {
    ty = Math.max(inset, Math.min(H - inset, ty));
  } else {
    tx = Math.max(inset, Math.min(W - inset, tx));
  }
  node.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px)`;
}
