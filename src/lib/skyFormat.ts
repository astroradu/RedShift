/**
 * Sexagesimal formatters for the Sky Viewer's selection card.
 * Self-contained — no dependencies on three.js / astropy parity helpers.
 */

const RAD_TO_DEG = 180 / Math.PI;
const RAD_TO_HOURS = 12 / Math.PI;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** "18h 36m 56s" — RA in radians, normalised to [0, 24h). */
export function formatRA(raRad: number): string {
  let hours = ((raRad * RAD_TO_HOURS) % 24 + 24) % 24;
  let h = Math.floor(hours);
  let rem = (hours - h) * 60;
  let m = Math.floor(rem);
  let s = Math.round((rem - m) * 60);
  if (s === 60) { s = 0; m += 1; }
  if (m === 60) { m = 0; h += 1; }
  if (h === 24) h = 0;
  return `${pad2(h)}h ${pad2(m)}m ${pad2(s)}s`;
}

/** '+38°47'01"' — Dec in radians, signed. */
export function formatDec(decRad: number): string {
  const deg = decRad * RAD_TO_DEG;
  const sign = deg >= 0 ? '+' : '−';
  const abs = Math.abs(deg);
  let d = Math.floor(abs);
  let rem = (abs - d) * 60;
  let m = Math.floor(rem);
  let s = Math.round((rem - m) * 60);
  if (s === 60) { s = 0; m += 1; }
  if (m === 60) { m = 0; d += 1; }
  return `${sign}${pad2(d)}°${pad2(m)}'${pad2(s)}"`;
}

/** '+47.2°' — altitude in radians, signed, one decimal. */
export function formatAlt(altRad: number): string {
  const d = altRad * RAD_TO_DEG;
  const sign = d >= 0 ? '+' : '−';
  return `${sign}${Math.abs(d).toFixed(1)}°`;
}

/** '213°' — azimuth in radians, [0, 360) degrees, integer. */
export function formatAz(azRad: number): string {
  const d = ((azRad * RAD_TO_DEG) % 360 + 360) % 360;
  return `${Math.round(d)}°`;
}

/** "190.5'" — arcminutes with one decimal. Negative input falls back to '—'. */
export function formatArcmin(am: number | null | undefined): string {
  if (am == null || !Number.isFinite(am) || am < 0) return '—';
  return `${am.toFixed(1)}'`;
}
