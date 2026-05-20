import type { NotableStar } from '../../../types';

export const FIELD_STRIDE = 5;

export interface XYZ {
  x: number;
  y: number;
  z: number;
}

export function raDecToXyz(raRad: number, decRad: number, distanceLy: number): XYZ {
  const cosDec = Math.cos(decRad);
  return {
    x: -distanceLy * cosDec * Math.sin(raRad),
    y:  distanceLy * Math.sin(decRad),
    z: -distanceLy * cosDec * Math.cos(raRad),
  };
}

// Observer-frame cartesian for a point at (alt, az). Convention:
// +X east, +Y up, +Z south. az=0 is north (-Z); az=π/2 is east (+X).
export function altAzToXyz(altRad: number, azRad: number, distance: number): XYZ {
  const cosAlt = Math.cos(altRad);
  return {
    x:  distance * cosAlt * Math.sin(azRad),
    y:  distance * Math.sin(altRad),
    z: -distance * cosAlt * Math.cos(azRad),
  };
}

export interface ParsedStars {
  count: number;
  positions: Float32Array;
  mag: Float32Array;
  colorIndex: Float32Array;
  index: Float32Array;
}

export function parsePackedStars(buffer: ArrayBuffer, rowCount: number): ParsedStars {
  const view = new Float32Array(buffer);

  const positions = new Float32Array(rowCount * 3);
  const mag = new Float32Array(rowCount);
  const colorIndex = new Float32Array(rowCount);
  const index = new Float32Array(rowCount);

  let kept = 0;
  for (let i = 0; i < rowCount; i++) {
    const base = i * FIELD_STRIDE;
    const ra = view[base + 0];
    const dec = view[base + 1];
    const m = view[base + 2];
    const ci = view[base + 3];
    const d = view[base + 4];
    if (!(d > 0)) continue;

    const xyz = raDecToXyz(ra, dec, d);
    positions[kept * 3 + 0] = xyz.x;
    positions[kept * 3 + 1] = xyz.y;
    positions[kept * 3 + 2] = xyz.z;
    mag[kept] = m;
    colorIndex[kept] = ci;
    index[kept] = kept;
    kept++;
  }

  if (kept === rowCount) {
    return { count: kept, positions, mag, colorIndex, index };
  }

  return {
    count: kept,
    positions: positions.subarray(0, kept * 3),
    mag: mag.subarray(0, kept),
    colorIndex: colorIndex.subarray(0, kept),
    index: index.subarray(0, kept),
  };
}

export function alignNotableToRendered(
  stars: { count: number; positions: Float32Array },
  notable: NotableStar[],
  toleranceRad = 1e-4,
): (NotableStar | null)[] {
  const candidates = notable.filter((n) => n.distance_ly != null && n.distance_ly > 0);

  const aligned: (NotableStar | null)[] = new Array(stars.count).fill(null);
  for (let i = 0; i < Math.min(stars.count, candidates.length); i++) {
    aligned[i] = candidates[i];
  }
  for (let i = 0; i < stars.count; i++) {
    const x = stars.positions[i * 3 + 0];
    const y = stars.positions[i * 3 + 1];
    const z = stars.positions[i * 3 + 2];
    const r = Math.sqrt(x * x + y * y + z * z);
    if (r === 0) { aligned[i] = null; continue; }
    const dec = Math.asin(y / r);
    const ra = Math.atan2(-x, -z);
    const raNorm = ra < 0 ? ra + Math.PI * 2 : ra;
    const guess = aligned[i];
    if (!guess) continue;
    const dRa = Math.abs(((guess.ra_rad - raNorm + Math.PI) % (Math.PI * 2)) - Math.PI);
    const dDec = Math.abs(guess.dec_rad - dec);
    if (dRa > toleranceRad || dDec > toleranceRad) {
      aligned[i] = null;
    }
  }
  return aligned;
}
