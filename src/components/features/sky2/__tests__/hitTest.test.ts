import { describe, expect, it } from 'vitest';
import { PROJ_MODE_NUM } from '../projection';
import { pickStarIndex, starSpriteCssPx } from '../hitTest';
import type { ParsedStars } from '../starsData';

function makeStars(rows: Array<{ x: number; y: number; z: number; mag: number }>): ParsedStars {
  const count = rows.length;
  const positions = new Float32Array(count * 3);
  const mag = new Float32Array(count);
  const colorIndex = new Float32Array(count);
  const index = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3 + 0] = rows[i].x;
    positions[i * 3 + 1] = rows[i].y;
    positions[i * 3 + 2] = rows[i].z;
    mag[i] = rows[i].mag;
    index[i] = i;
  }
  return { count, positions, mag, colorIndex, index };
}

const DEFAULT_VIEW = {
  yaw: 0, pitch: 0, fovDeg: 60,
  projMode: PROJ_MODE_NUM.rect, viewportW: 800, viewportH: 600,
};

describe('starSpriteCssPx', () => {
  it('clamps to the max for the very brightest stars', () => {
    expect(starSpriteCssPx(-3)).toBe(14);
  });

  it('clamps to the min for the dimmest stars', () => {
    expect(starSpriteCssPx(8)).toBe(2);
  });

  it('decreases monotonically with apparent magnitude', () => {
    expect(starSpriteCssPx(0)).toBeGreaterThan(starSpriteCssPx(2));
    expect(starSpriteCssPx(2)).toBeGreaterThan(starSpriteCssPx(4));
  });
});

describe('pickStarIndex', () => {
  // Note: positions are celestial-cartesian (raDecToXyz outputs). The shader
  // applies an alt/az transform using (lstRad, latRad); for these tests we pick
  // positions that land at known observer-frame locations after that transform
  // at lstRad=0, latRad=0. Specifically: (0, r, 0) is the north celestial pole
  // in celestial space, which at lat=0/lst=0 maps to the forward direction
  // (alt=0, az=0); (0, -r, 0) is the south celestial pole and maps behind the
  // camera. See the inversion math in hitTest.ts::pickStarIndex.

  it('picks the star whose sprite covers the cursor', () => {
    const stars = makeStars([
      { x: 0,  y: 10, z: 0, mag: 1 },
    ]);
    const idx = pickStarIndex(stars, DEFAULT_VIEW, 400, 300, stars.count, 0, 0);
    expect(idx).toBe(0);
  });

  it('returns -1 when no star is within sprite tolerance', () => {
    const stars = makeStars([
      { x: 0, y: 10, z: 0, mag: 1 },
    ]);
    const idx = pickStarIndex(stars, DEFAULT_VIEW, 0, 0, stars.count, 0, 0);
    expect(idx).toBe(-1);
  });

  it('skips stars that are behind the camera', () => {
    const stars = makeStars([
      { x: 0, y: -10, z: 0, mag: 1 },
    ]);
    const idx = pickStarIndex(stars, DEFAULT_VIEW, 400, 300, stars.count, 0, 0);
    expect(idx).toBe(-1);
  });

  it('ignores stars beyond the density cutoff (uMaxIndex)', () => {
    const stars = makeStars([
      { x: 0, y: 10, z: 0, mag: 1 },
    ]);
    const idx = pickStarIndex(stars, DEFAULT_VIEW, 400, 300, 0, 0, 0);
    expect(idx).toBe(-1);
  });

  it('prefers the nearest sprite when two overlap at the cursor', () => {
    // Two stars near the north celestial pole — one exactly at the pole (forward
    // after transform), one with a tiny offset that lands ~3 px right of center.
    const stars = makeStars([
      { x: 0,    y: 10, z: 0,    mag: 5 },
      { x: 0.05, y: 10, z: 0,    mag: 0 },
    ]);
    const idx = pickStarIndex(stars, DEFAULT_VIEW, 400, 300, stars.count, 0, 0);
    expect(idx).toBe(0);
  });
});
