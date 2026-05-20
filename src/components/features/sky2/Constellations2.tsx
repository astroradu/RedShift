// Constellations2 — DOM labels for each constellation, projected per frame
// using the same RA/Dec → alt/az → screen math as the GPU shader so the
// lettering stays glued to the constellation center as time advances.

import { type MutableRefObject, useEffect, useRef } from 'react';
import { projectWorldToScreen, type ProjModeNum } from './projection';
import { altAzToXyz } from './starsData';
import { raDecToAltAz } from '../../../lib/skyMath';
import type { SceneView } from './particleScene';
import type { Constellation } from '../../../types';

interface Props {
  wrapRef: MutableRefObject<HTMLDivElement | null>;
  getView: () => SceneView | null;
  getLstLat: () => { lstRad: number; latRad: number };
  constellations: Constellation[];
  show: boolean;
}

export function Constellations2({ wrapRef, getView, getLstLat, constellations, show }: Props) {
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
        const { lstRad, latRad } = getLstLat();
        for (let i = 0; i < constellations.length; i++) {
          const node = nodeRefs.current[i];
          if (!node) continue;
          const c = constellations[i];
          const ra = c.center_ra_h * Math.PI / 12;
          const dec = c.center_dec_d * Math.PI / 180;
          const { altRad, azRad } = raDecToAltAz(ra, dec, lstRad, latRad);
          const p = projectWorldToScreen(altAzToXyz(altRad, azRad, 420), {
            yaw: view.yaw, pitch: view.pitch, fovDeg: view.fovDeg,
            projMode: view.projMode as ProjModeNum,
            viewportW: W, viewportH: H,
          });
          if (!p.visible) { node.style.display = 'none'; continue; }
          node.style.display = '';
          node.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [show, wrapRef, getView, getLstLat, constellations]);

  if (!show) return null;
  return (
    <div className="sky2-const-labels" aria-hidden="true">
      {constellations.map((c, i) => (
        <span
          key={c.name}
          ref={(el) => { nodeRefs.current[i] = el; }}
          className="sky2-const-label"
        >
          {c.name}
        </span>
      ))}
    </div>
  );
}
