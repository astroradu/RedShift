import { type MutableRefObject, useEffect, useMemo, useRef } from 'react';
import { STRINGS } from '../../../lib/strings';
import { projectWorldToScreen, type ProjModeNum } from './projection';
import { altAzToXyz } from './starsData';
import type { SceneView } from './particleScene';

interface Props {
  wrapRef: MutableRefObject<HTMLDivElement | null>;
  getView: () => SceneView | null;
}

interface CardinalDef {
  label: string;
  azRad: number;
  major: boolean;
}

const TAU = Math.PI * 2;
// Anchor cardinals just below the dashed horizon line so the lettering sits in
// the ground veil's territory without overlapping the line itself.
const ANCHOR_ALT_RAD = -3 * Math.PI / 180;

export function CardinalLabels2({ wrapRef, getView }: Props) {
  const S = STRINGS.SKY2;

  // Observer-frame mapping: az=0 → N, increasing clockwise (compass bearing).
  const dirs = useMemo<CardinalDef[]>(
    () => [
      { label: S.CARDINAL_N,  azRad: 0,           major: true  },
      { label: S.CARDINAL_NE, azRad: TAU * 1 / 8, major: false },
      { label: S.CARDINAL_E,  azRad: TAU * 2 / 8, major: true  },
      { label: S.CARDINAL_SE, azRad: TAU * 3 / 8, major: false },
      { label: S.CARDINAL_S,  azRad: TAU * 4 / 8, major: true  },
      { label: S.CARDINAL_SW, azRad: TAU * 5 / 8, major: false },
      { label: S.CARDINAL_W,  azRad: TAU * 6 / 8, major: true  },
      { label: S.CARDINAL_NW, azRad: TAU * 7 / 8, major: false },
    ],
    [S],
  );

  const nodeRefs = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const wrap = wrapRef.current;
      const view = getView();
      if (wrap && view) {
        const W = wrap.clientWidth;
        const H = wrap.clientHeight;
        for (let i = 0; i < dirs.length; i++) {
          const node = nodeRefs.current[i];
          if (!node) continue;
          const xyz = altAzToXyz(ANCHOR_ALT_RAD, dirs[i].azRad, 420);
          const p = projectWorldToScreen(xyz, {
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
  }, [dirs, wrapRef, getView]);

  return (
    <div className="sky2-cardinals" aria-hidden="true">
      {dirs.map((d, i) => (
        <span
          key={d.label}
          ref={(el) => {
            nodeRefs.current[i] = el;
          }}
          className={'sky2-card' + (d.major ? ' major' : '')}
        >
          {d.label}
        </span>
      ))}
    </div>
  );
}
