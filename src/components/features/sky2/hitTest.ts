/**
 * CPU hit-test for star sprites.
 *
 * Mirrors the size formula in the stars vertex shader (`shaders.ts`):
 *   const float MIN_VISIBLE_MAG = -2.0;
 *   float baseSize = clamp(14.0 - 1.4 * (aMag - MIN_VISIBLE_MAG), 2.0, 14.0);
 *
 * Keeping the constants and clamp range identical here means a click within
 * the visible sprite always picks that star — hover tolerance matches the
 * pixel the user is actually looking at. Diverge from the shader here and the
 * cursor will pick "nothing" while obviously sitting on a star.
 *
 * Density gating: the density slider drives `uMaxIndex` on the GPU, which the
 * vertex shader uses to cull dimmer stars. The CPU picker honors the same
 * cutoff via the `maxIndex` argument so anything not rendered is also not
 * pickable.
 */

import { projectWorldToScreen, type ProjectArgs } from './projection';
import { altAzToXyz, type ParsedStars } from './starsData';
import { raDecToAltAz } from '../../../lib/skyMath';
import type { Galaxy } from '../../../types';

// Mirror of the shader constants — keep in lockstep with shaders.ts.
const STAR_MIN_VISIBLE_MAG = -2;
const STAR_SIZE_BASE = 14;
const STAR_SIZE_SLOPE = 1.4;
const STAR_SIZE_MIN = 2;
const STAR_SIZE_MAX = 14;

// A small buffer added to the half-sprite radius so the user does not have to
// hit the exact pixel center of dim stars (which clamp to 2 px wide).
const STAR_PICK_PAD_PX = 2;

/**
 * Pixel diameter of the on-screen sprite for a star of apparent magnitude
 * `mag`, matching the GLSL `baseSize` computation. Clamped to [2, 14] px.
 */
export function starSpriteCssPx(mag: number): number {
  const s = STAR_SIZE_BASE - STAR_SIZE_SLOPE * (mag - STAR_MIN_VISIBLE_MAG);
  return Math.max(STAR_SIZE_MIN, Math.min(STAR_SIZE_MAX, s));
}

/**
 * Find the star whose sprite covers the cursor at (`px`, `py`) in CSS pixels.
 *
 * Returns the index into `stars.positions`/`stars.mag`, or `-1` if no sprite
 * is within tolerance. When multiple sprites overlap the cursor, the closest
 * (smallest squared distance) wins — that gives the user the star they
 * visually appear to be clicking, not whichever happens to come first in the
 * buffer.
 *
 * `maxIndex` mirrors the GPU's `uMaxIndex` density cutoff: stars at or beyond
 * that index are not drawn and therefore not pickable.
 */
export function pickStarIndex(
  stars: ParsedStars,
  view: ProjectArgs,
  px: number,
  py: number,
  maxIndex: number,
  lstRad: number,
  latRad: number,
  densityMask?: Uint8Array | null,
): number {
  let bestI = -1;
  let bestD2 = Infinity;

  // Clamp to whichever is smaller — the density cutoff or the buffer length.
  // Negative or zero maxIndex naturally yields an empty loop.
  const limit = Math.min(stars.count, maxIndex);

  for (let i = 0; i < limit; i++) {
    // Density-mode cull: same flag the GPU uses (aDensity = 0 → not drawn).
    if (densityMask && densityMask[i] < 1) continue;

    // CPU mirror of the GLSL inversion + alt/az transform in particleVertexShader.
    // The buffer holds celestial cartesian; we invert to (ra, dec), apply the
    // standard RA/Dec → alt/az transform (lib/skyMath), then re-cartesianify
    // into observer frame so projectWorldToScreen agrees with the GPU.
    const x = stars.positions[i * 3 + 0];
    const y = stars.positions[i * 3 + 1];
    const z = stars.positions[i * 3 + 2];
    const r = Math.sqrt(x * x + y * y + z * z);
    if (r === 0) continue;
    const dec = Math.asin(y / r);
    const ra = Math.atan2(-x, -z);
    const { altRad, azRad } = raDecToAltAz(ra, dec, lstRad, latRad);
    const obs = altAzToXyz(altRad, azRad, r);
    const sp = projectWorldToScreen(obs, view);
    if (!sp.visible) continue;

    const dx = sp.x - px;
    const dy = sp.y - py;
    const d2 = dx * dx + dy * dy;

    const tol = starSpriteCssPx(stars.mag[i]) * 0.5 + STAR_PICK_PAD_PX;
    const tol2 = tol * tol;

    if (d2 < tol2 && d2 < bestD2) {
      bestD2 = d2;
      bestI = i;
    }
  }
  return bestI;
}

/**
 * Pixel pick for galaxy ellipses. Mirrors the GPU rendering: project the
 * galaxy center to screen, compute the major-axis on-screen radius from the
 * pinhole approximation `pxPerRad = viewportH / radians(fovDeg)`, accept hits
 * within `max(majorPx, MIN_GALAXY_PICK_PX)`. Smallest squared distance wins.
 *
 * The circular tolerance is intentionally coarser than the rendered ellipse —
 * most PGC entries are below 5' in angular size, indistinguishable from a dot
 * at typical FOV. A rotated-ellipse hit-test buys nothing perceptible there.
 */
const MIN_GALAXY_PICK_PX = 10;
const ARCMIN_TO_RAD = Math.PI / (180 * 60);

export function pickGalaxyIndex(
  galaxies: readonly Galaxy[],
  view: ProjectArgs,
  px: number,
  py: number,
  lstRad: number,
  latRad: number,
): number {
  if (galaxies.length === 0) return -1;
  const DOME_RADIUS = 420;
  const fovRad = (view.fovDeg * Math.PI) / 180;
  const pxPerRad = view.viewportH / Math.max(fovRad, 1e-3);

  let bestI = -1;
  let bestD2 = Infinity;

  for (let i = 0; i < galaxies.length; i++) {
    const g = galaxies[i];
    const ra = (g.ra_deg * Math.PI) / 180;
    const dec = (g.dec_deg * Math.PI) / 180;
    const { altRad, azRad } = raDecToAltAz(ra, dec, lstRad, latRad);
    const obs = altAzToXyz(altRad, azRad, DOME_RADIUS);
    const sp = projectWorldToScreen(obs, view);
    if (!sp.visible) continue;

    const dx = sp.x - px;
    const dy = sp.y - py;
    const d2 = dx * dx + dy * dy;

    // Major-axis diameter on screen → use half as the radial tolerance.
    const majorDiamPx = g.major_arcmin * ARCMIN_TO_RAD * pxPerRad;
    const tol = Math.max(majorDiamPx * 0.5, MIN_GALAXY_PICK_PX);
    const tol2 = tol * tol;

    if (d2 < tol2 && d2 < bestD2) {
      bestD2 = d2;
      bestI = i;
    }
  }
  return bestI;
}
