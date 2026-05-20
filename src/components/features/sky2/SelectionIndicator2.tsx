// Spinning crosshair around the currently selected star or galaxy.
//
// Pattern mirrors CardinalLabels2 / GridLabels2: one persistent rAF loop that
// projects the selected object's 3D coordinates each frame. `selection` is
// held in a ref so the rAF doesn't tear down on every selection change, and a
// useLayoutEffect synchronously hides the node when selection clears or
// switches — prevents a one-frame paint of the stale position.

import { type MutableRefObject, useEffect, useLayoutEffect, useRef } from 'react';
import { projectWorldToScreen } from './projection';
import { altAzToXyz } from './starsData';
import { raDecToAltAz } from '../../../lib/skyMath';
import type { SceneView } from './particleScene';
import type { Selection } from './selection';

const DEG = Math.PI / 180;
const DOME_RADIUS = 420;

interface Props {
  selection: Selection | null;
  wrapRef: MutableRefObject<HTMLDivElement | null>;
  getView: () => SceneView | null;
  getLstLat: () => { lstRad: number; latRad: number };
}

export function SelectionIndicator2({ selection, wrapRef, getView, getLstLat }: Props) {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const selectionRef = useRef<Selection | null>(selection);

  // Synchronously hide the node when selection clears or switches; otherwise
  // the next paint can flash the stale position from the previous selection
  // before the next rAF tick runs.
  useLayoutEffect(() => {
    selectionRef.current = selection;
    const node = nodeRef.current;
    if (!node) return;
    if (!selection) node.style.display = 'none';
    else node.style.display = 'none'; // will reappear on the next rAF tick at the new spot
  }, [selection]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const sel = selectionRef.current;
      const wrap = wrapRef.current;
      const node = nodeRef.current;
      const view = getView();
      if (!sel || !wrap || !view || !node) {
        if (node) node.style.display = 'none';
        raf = requestAnimationFrame(tick);
        return;
      }
      const raRad = sel.kind === 'star' ? sel.star.ra_rad  : sel.galaxy.ra_deg  * DEG;
      const decRad = sel.kind === 'star' ? sel.star.dec_rad : sel.galaxy.dec_deg * DEG;
      const { lstRad, latRad } = getLstLat();
      const { altRad, azRad } = raDecToAltAz(raRad, decRad, lstRad, latRad);
      const obs = altAzToXyz(altRad, azRad, DOME_RADIUS);
      const p = projectWorldToScreen(obs, {
        yaw: view.yaw, pitch: view.pitch, fovDeg: view.fovDeg,
        projMode: view.projMode,
        viewportW: wrap.clientWidth, viewportH: wrap.clientHeight,
      });
      if (!p.visible) {
        node.style.display = 'none';
      } else {
        node.style.display = '';
        node.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [wrapRef, getView, getLstLat]);

  return (
    <div
      ref={nodeRef}
      className="sky2-selection"
      style={{ display: 'none' }}
      aria-hidden="true"
    >
      <svg
        className="sky2-selection-spin"
        viewBox="0 0 100 100"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      >
        {/* Ring broken into four arcs at N / E / S / W. */}
        <circle cx="50" cy="50" r="38" strokeDasharray="46 14" />
      </svg>
    </div>
  );
}
