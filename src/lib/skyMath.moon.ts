/**
 * Low-precision moon ephemeris (Meeus, Astronomical Algorithms, Ch. 47).
 *
 * Accuracy goal: ~few arcmin in apparent position over the 21st century —
 * well past what the 22px disc or the 24px-tall ribbon can resolve. Phase
 * angle drives illumination + phase fraction from real sun-moon elongation
 * rather than a synodic-month modulus, so rise/set on the ribbon track
 * matches reality.
 */

import { STRINGS } from './strings';
import { julianDate, lst, raDecToAltAz } from './skyMath';

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

function norm360(deg: number): number {
  const r = deg % 360;
  return r < 0 ? r + 360 : r;
}
function normTau(rad: number): number {
  const r = rad % TAU;
  return r < 0 ? r + TAU : r;
}

/** Phase-name keys — display strings live in `STRINGS.SKY2.MOON_PHASE_*`. */
export const MOON_PHASE_KEYS = {
  NEW:        'NEW',
  WAX_CRES:   'WAX_CRES',
  FIRST_QTR:  'FIRST_QTR',
  WAX_GIB:    'WAX_GIB',
  FULL:       'FULL',
  WAN_GIB:    'WAN_GIB',
  LAST_QTR:   'LAST_QTR',
  WAN_CRES:   'WAN_CRES',
} as const;
export type MoonPhaseKey = typeof MOON_PHASE_KEYS[keyof typeof MOON_PHASE_KEYS];

export interface MoonEphemeris {
  raRad: number;
  decRad: number;
  /** 0=new, 0.25=first qtr, 0.5=full, 0.75=last qtr; cycles back to ~1.0=new. */
  phaseFrac: number;
  /** Illuminated fraction in [0, 1]. */
  illumination: number;
}

/**
 * Meeus Ch. 47 low-precision moon position. Truncated to the top ~10 longitude
 * and 8 latitude terms — plenty for a stylised viewer.
 */
export function moonRaDec(jd: number): MoonEphemeris {
  const T = (jd - 2451545.0) / 36525;

  // Mean elements (Meeus 47.1–47.7), degrees.
  const Lp = norm360(218.3164591 + 481267.88134236 * T
    - 0.0013268 * T * T + (T * T * T) / 538841 - (T * T * T * T) / 65194000);
  const D  = norm360(297.8502042 + 445267.1115168 * T
    - 0.00163 * T * T + (T * T * T) / 545868 - (T * T * T * T) / 113065000);
  const M  = norm360(357.5291092 + 35999.0502909 * T
    - 0.0001536 * T * T + (T * T * T) / 24490000);
  const Mp = norm360(134.9634114 + 477198.8676313 * T
    + 0.008997 * T * T + (T * T * T) / 69699 - (T * T * T * T) / 14712000);
  const F  = norm360(93.2720993  + 483202.0175273 * T
    - 0.0034029 * T * T - (T * T * T) / 3526000 + (T * T * T * T) / 863310000);

  const Dr = D * DEG, Mr = M * DEG, Mpr = Mp * DEG, Fr = F * DEG;

  const sumL =
       6288774 * Math.sin(Mpr)
    + 1274027 * Math.sin(2 * Dr - Mpr)
    +  658314 * Math.sin(2 * Dr)
    +  213618 * Math.sin(2 * Mpr)
    -  185116 * Math.sin(Mr)
    -  114332 * Math.sin(2 * Fr)
    +   58793 * Math.sin(2 * Dr - 2 * Mpr)
    +   57066 * Math.sin(2 * Dr - Mr - Mpr)
    +   53322 * Math.sin(2 * Dr + Mpr)
    +   45758 * Math.sin(2 * Dr - Mr);

  const sumB =
       5128122 * Math.sin(Fr)
    +  280602 * Math.sin(Mpr + Fr)
    +  277693 * Math.sin(Mpr - Fr)
    +  173237 * Math.sin(2 * Dr - Fr)
    +   55413 * Math.sin(2 * Dr - Mpr + Fr)
    +   46271 * Math.sin(2 * Dr - Mpr - Fr)
    +   32573 * Math.sin(2 * Dr + Fr)
    +   17198 * Math.sin(2 * Mpr + Fr);

  const lambdaDeg = Lp + sumL / 1e6;
  const betaDeg   =       sumB / 1e6;

  const epsDeg = 23.43929 - 0.0130042 * T;
  const lambda = lambdaDeg * DEG;
  const beta   = betaDeg   * DEG;
  const eps    = epsDeg    * DEG;

  const sinL = Math.sin(lambda), cosL = Math.cos(lambda);
  const sinB = Math.sin(beta),  cosB = Math.cos(beta);
  const sinE = Math.sin(eps),   cosE = Math.cos(eps);
  const raRad  = normTau(Math.atan2(sinL * cosE - Math.tan(beta) * sinE, cosL));
  const decRad = Math.asin(sinB * cosE + cosB * sinE * sinL);

  // Low-precision sun ecliptic longitude for elongation.
  const D2000 = jd - 2451545.0;
  const g  = (357.529 + 0.98560028 * D2000) * DEG;
  const q  = 280.459  + 0.98564736 * D2000;
  const sunLamDeg = q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g);
  const sunLam = sunLamDeg * DEG;

  // Signed elongation in (−π, π]; positive = moon ahead of sun (waxing).
  const elong = ((lambda - sunLam + Math.PI) % TAU + TAU) % TAU - Math.PI;
  const phaseFrac = (elong < 0 ? elong + TAU : elong) / TAU;

  // Illumination from phase angle i (Meeus 48.1): cos(i) = -cos(elong)·cos(beta),
  // then k = (1 + cos(i)) / 2. At new moon: elong=0 → cos(i)=-1 → k=0 (dark).
  // At full: elong=π → cos(i)=+1 → k=1 (fully lit).
  const cosI = -Math.cos(elong) * Math.cos(beta);
  const illumination = (1 + Math.max(-1, Math.min(1, cosI))) / 2;

  return { raRad, decRad, phaseFrac, illumination };
}

/** Map a phase fraction to one of the eight canonical phase keys. */
export function phaseKey(p: number): MoonPhaseKey {
  if (p < 0.03 || p > 0.97) return MOON_PHASE_KEYS.NEW;
  if (p < 0.22) return MOON_PHASE_KEYS.WAX_CRES;
  if (p < 0.28) return MOON_PHASE_KEYS.FIRST_QTR;
  if (p < 0.47) return MOON_PHASE_KEYS.WAX_GIB;
  if (p < 0.53) return MOON_PHASE_KEYS.FULL;
  if (p < 0.72) return MOON_PHASE_KEYS.WAN_GIB;
  if (p < 0.78) return MOON_PHASE_KEYS.LAST_QTR;
  return MOON_PHASE_KEYS.WAN_CRES;
}

/** Convenience: phase key → user-visible display string via STRINGS.SKY2. */
export function phaseName(p: number): string {
  const S = STRINGS.SKY2;
  switch (phaseKey(p)) {
    case MOON_PHASE_KEYS.NEW:       return S.MOON_PHASE_NEW;
    case MOON_PHASE_KEYS.WAX_CRES:  return S.MOON_PHASE_WAX_CRES;
    case MOON_PHASE_KEYS.FIRST_QTR: return S.MOON_PHASE_FIRST_QTR;
    case MOON_PHASE_KEYS.WAX_GIB:   return S.MOON_PHASE_WAX_GIB;
    case MOON_PHASE_KEYS.FULL:      return S.MOON_PHASE_FULL;
    case MOON_PHASE_KEYS.WAN_GIB:   return S.MOON_PHASE_WAN_GIB;
    case MOON_PHASE_KEYS.LAST_QTR:  return S.MOON_PHASE_LAST_QTR;
    case MOON_PHASE_KEYS.WAN_CRES:  return S.MOON_PHASE_WAN_CRES;
  }
}

/** Moon altitude in degrees at `date` for an observer at (latRad, lonRad). */
export function moonAltDeg(date: Date, latRad: number, lonRad: number): number {
  const jd = julianDate(date);
  const { raRad, decRad } = moonRaDec(jd);
  const lstRad = lst(jd, lonRad);
  const { altRad } = raDecToAltAz(raRad, decRad, lstRad, latRad);
  return altRad / DEG;
}

/**
 * SVG path for the moon's lit portion. ViewBox-centered at (0,0), disc radius R.
 * Phase < 0.5 lights the right side (waxing); > 0.5 lights the left (waning).
 */
export function moonLitPath(phaseFrac: number, R = 10): string {
  const angle = 2 * Math.PI * phaseFrac;
  const cosA = Math.cos(angle);
  const rx = R * Math.abs(cosA);
  let sweep1: 0 | 1;
  let sweep2: 0 | 1;
  if (phaseFrac < 0.5) {
    sweep1 = 1;
    sweep2 = cosA > 0 ? 0 : 1;
  } else {
    sweep1 = 0;
    sweep2 = cosA > 0 ? 1 : 0;
  }
  return `M 0,${-R} A ${R},${R} 0 0,${sweep1} 0,${R} A ${rx},${R} 0 0,${sweep2} 0,${-R} Z`;
}
