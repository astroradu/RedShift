/**
 * Sky math helpers — sidereal time and RA/Dec → alt/az conversions.
 * CPU mirror of the GPU vertex paths in src/components/features/sky2/.
 *
 * Formulas:
 *   - julianDate: standard Gregorian → JD (Meeus, Astronomical Algorithms, ch. 7).
 *   - gmst: IAU 1982 / Meeus eq. 12.4 — Greenwich Mean Sidereal Time in radians.
 *   - lst: gmst + observerLonRad (east positive).
 *   - raDecToAltAz: standard spherical trig.
 *
 * All angles in radians.
 */

const TAU = Math.PI * 2;
const SEC_PER_HOUR = 3600;
const RAD_PER_HOUR = Math.PI / 12; // 15° in rad

/** Julian Date from a JavaScript Date (UTC). */
export function julianDate(date: Date): number {
  // Meeus 7.1 — works for any Gregorian date (year ≥ 1582).
  let y = date.getUTCFullYear();
  let m = date.getUTCMonth() + 1; // JS months are 0-based
  const d =
    date.getUTCDate() +
    (date.getUTCHours() + (date.getUTCMinutes() + date.getUTCSeconds() / 60) / 60) / 24;

  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4); // Gregorian correction
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
}

/** Greenwich Mean Sidereal Time in radians, in [0, 2π). */
export function gmst(jd: number): number {
  // IAU 1982 formula (Meeus eq. 12.4) — accurate to ~0.1s within a few centuries of J2000.
  const T = (jd - 2451545.0) / 36525.0;
  // GMST in seconds of time:
  const seconds =
    67310.54841 +
    (876600 * 3600 + 8640184.812866) * T +
    0.093104 * T * T -
    6.2e-6 * T * T * T;
  const hours = ((seconds / SEC_PER_HOUR) % 24 + 24) % 24;
  return hours * RAD_PER_HOUR;
}

/** Local Sidereal Time in radians. observerLonRad: east positive. */
export function lst(jd: number, observerLonRad: number): number {
  const v = gmst(jd) + observerLonRad;
  return ((v % TAU) + TAU) % TAU;
}

export interface AltAz {
  altRad: number;
  azRad: number;
}

/**
 * Convert equatorial (RA, Dec) → horizontal (alt, az) for a given LST and observer latitude.
 *
 * Convention: alt > 0 above horizon. az = 0 at North, increasing eastward.
 * This matches the design's altAzToVec convention (+X east, +Y up, +Z south).
 */
export function raDecToAltAz(raRad: number, decRad: number, lstRad: number, latRad: number): AltAz {
  const H = lstRad - raRad; // hour angle
  const sinAlt =
    Math.sin(decRad) * Math.sin(latRad) +
    Math.cos(decRad) * Math.cos(latRad) * Math.cos(H);
  const altRad = Math.asin(Math.max(-1, Math.min(1, sinAlt)));

  const y = -Math.cos(decRad) * Math.sin(H);
  const x =
    Math.sin(decRad) * Math.cos(latRad) - Math.cos(decRad) * Math.sin(latRad) * Math.cos(H);
  const azRad = ((Math.atan2(y, x) % TAU) + TAU) % TAU;

  return { altRad, azRad };
}

const DEG = Math.PI / 180;

/**
 * Approximate apparent (RA, Dec) of the sun at the given JD (USNO low-accuracy
 * formula — accurate to ~0.01°, far more than the timeline gradient needs).
 */
export function sunRaDec(jd: number): { raRad: number; decRad: number } {
  const D = jd - 2451545.0;
  const gDeg = (357.529 + 0.98560028 * D) % 360;
  const qDeg = (280.459 + 0.98564736 * D) % 360;
  const gRad = gDeg * DEG;
  const lDeg = qDeg + 1.915 * Math.sin(gRad) + 0.020 * Math.sin(2 * gRad);
  const eDeg = 23.439 - 0.00000036 * D;
  const lRad = lDeg * DEG;
  const eRad = eDeg * DEG;
  const raRad = Math.atan2(Math.cos(eRad) * Math.sin(lRad), Math.cos(lRad));
  const decRad = Math.asin(Math.sin(eRad) * Math.sin(lRad));
  return { raRad, decRad };
}

/** Sun altitude in degrees at `date` for an observer at (latRad, lonRad). */
export function sunAltDeg(date: Date, latRad: number, lonRad: number): number {
  const jd = julianDate(date);
  const { raRad, decRad } = sunRaDec(jd);
  const lstRad = lst(jd, lonRad);
  const { altRad } = raDecToAltAz(raRad, decRad, lstRad, latRad);
  return altRad / DEG;
}

export {
  moonRaDec,
  moonAltDeg,
  phaseName,
  phaseKey,
  moonLitPath,
  MOON_PHASE_KEYS,
  type MoonEphemeris,
  type MoonPhaseKey,
} from './skyMath.moon';
