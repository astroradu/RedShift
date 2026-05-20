const TWO_PI = Math.PI * 2;

/**
 * Returns the shortest signed angle (in radians) to go from `from` to `to`.
 * Result lies in [-π, π). Handles any accumulated rotation in `from` — full
 * turns are absorbed by the modulo, so the camera always takes the short way
 * around regardless of how many times the user has spun.
 */
export function shortestYawDelta(from: number, to: number): number {
  let dy = (to - from + Math.PI) % TWO_PI;
  if (dy < 0) dy += TWO_PI;
  return dy - Math.PI;
}
