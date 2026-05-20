/**
 * Convert a B−V color index to an approximate RGB triple in [0, 1].
 *
 * Two-step approximation:
 *   1. B−V → effective temperature (K) via Ballesteros 2012 (PASP 124, 140):
 *      T = 4600 · (1 / (0.92·BV + 1.7)  +  1 / (0.92·BV + 0.62))
 *   2. T → RGB via a blackbody approximation (Tanner Helland's empirical curves,
 *      adapted to clamp 1000–40000 K).
 *
 * Used to bake a 256-entry lookup texture sampled in the star fragment shader.
 */

export function bvToRGB(bv: number): [number, number, number] {
  // Clamp BV to a sensible range; very negative / very positive values become
  // saturation extremes rather than NaN.
  const v = Math.max(-0.4, Math.min(2.0, bv));
  const t = 4600 * (1.0 / (0.92 * v + 1.7) + 1.0 / (0.92 * v + 0.62));
  return blackbodyRGB(t);
}

/** Tanner Helland blackbody approximation. Input: temperature in K. */
function blackbodyRGB(tempK: number): [number, number, number] {
  const t = Math.max(1000, Math.min(40000, tempK)) / 100;

  let r: number;
  let g: number;
  let b: number;

  if (t <= 66) {
    r = 255;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
  }

  if (t <= 66) {
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
  } else {
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  }

  if (t >= 66) {
    b = 255;
  } else if (t <= 19) {
    b = 0;
  } else {
    b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  }

  return [clamp01(r / 255), clamp01(g / 255), clamp01(b / 255)];
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
