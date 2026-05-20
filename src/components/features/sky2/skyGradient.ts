/**
 * Day-night gradient + astronomical-night solver for the Sky 2 timeline.
 *
 * Color palette and skyColorsFor() are a verbatim port of Claude Design's
 * `skyStops` table at temp/sky-viewer.jsx:73–104. RGB tuples are unchanged.
 */

import { sunAltDeg, moonAltDeg, moonRaDec, julianDate } from '../../../lib/skyMath';

export interface SkyStop {
  altDeg: number;
  inner: [number, number, number];
  outer: [number, number, number];
}

export const SKY_STOPS: readonly SkyStop[] = [
  { altDeg: -18, inner: [10, 12, 22],   outer: [6,   8,  16]  }, // astronomical night
  { altDeg:  -8, inner: [28, 30, 44],   outer: [32, 36, 58]  }, // nautical twilight
  { altDeg:  -2, inner: [88, 70, 76],   outer: [58, 64, 86]  }, // dusk / dawn glow
  { altDeg:   3, inner: [176,140,116],  outer: [88, 96, 118] }, // sunrise / sunset
  { altDeg:  12, inner: [192,170,140],  outer: [128,148,170] }, // golden
  { altDeg:  30, inner: [180,184,186],  outer: [142,162,182] }, // morning / afternoon
  { altDeg:  60, inner: [176,186,196],  outer: [126,150,176] }, // midday — soft desat blue
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpRGB(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

function rgbStr(c: [number, number, number]): string {
  return `rgb(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0})`;
}

/** Returns inner / outer sky colors for a given sun altitude in degrees. */
export function skyColorsFor(sunAltDegrees: number): { inner: string; outer: string } {
  if (sunAltDegrees < SKY_STOPS[0].altDeg) {
    return { inner: rgbStr(SKY_STOPS[0].inner), outer: rgbStr(SKY_STOPS[0].outer) };
  }
  const last = SKY_STOPS[SKY_STOPS.length - 1];
  if (sunAltDegrees > last.altDeg) {
    return { inner: rgbStr(last.inner), outer: rgbStr(last.outer) };
  }
  for (let i = 0; i < SKY_STOPS.length - 1; i++) {
    const lo = SKY_STOPS[i];
    const hi = SKY_STOPS[i + 1];
    if (sunAltDegrees >= lo.altDeg && sunAltDegrees <= hi.altDeg) {
      const t = (sunAltDegrees - lo.altDeg) / (hi.altDeg - lo.altDeg);
      return {
        inner: rgbStr(lerpRGB(lo.inner, hi.inner, t)),
        outer: rgbStr(lerpRGB(lo.outer, hi.outer, t)),
      };
    }
  }
  return { inner: rgbStr(last.inner), outer: rgbStr(last.outer) };
}

export interface AstroNightWindow {
  /** Slider pct where evening twilight ends (sun sinks through -18°); null if no crossing. */
  beginPct: number | null;
  /** Slider pct where morning twilight begins (sun rises through -18°); null if no crossing. */
  endPct: number | null;
}

export interface MoonRibbonData {
  /** Filled silver area beneath the moon-altitude curve. Empty when moon never up. */
  fillPath: string;
  /** Stroke along the curve itself. */
  linePath: string;
  /** Rise/set crossings in slider-percent (0..1) from left edge. */
  events: { kind: 'rise' | 'set'; pct: number }[];
  /** Phase at local noon — used by the rise/set crescent glyphs. */
  phaseRep: number;
}

export interface DayAnalysis {
  gradient: string;
  night: AstroNightWindow;
  moon: MoonRibbonData;
}

const ASTRO_NIGHT_ALT = -18;
const STEP_MINUTES = 5;
const STEPS_PER_DAY = (24 * 60) / STEP_MINUTES;     // 288
const GRADIENT_STOPS = 36;
const STEPS_PER_GRADIENT_STOP = STEPS_PER_DAY / GRADIENT_STOPS;
// Gradient axis is midnight-centred: stop i corresponds to clock hour
// ((i/36 * 24) + 12) mod 24, which is night-table index (144 + i*8) mod 288.
const GRADIENT_INDEX_OFFSET = (12 * 60) / STEP_MINUTES; // 144

function timeOfDayToPct(d: Date): number {
  const h = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  return ((h - 12 + 24) % 24) / 24;
}

function dateAtHourOfDay(base: Date, hour: number): Date {
  const d = new Date(base);
  const h = Math.floor(hour);
  const m = Math.floor((hour - h) * 60);
  const s = Math.floor(((hour - h) * 60 - m) * 60);
  d.setHours(h, m, s, 0);
  return d;
}

function bisectCrossing(
  base: Date,
  lat: number,
  lon: number,
  lo: number,
  hi: number,
  loAlt: number,
): Date {
  let l = lo;
  let h = hi;
  let lAlt = loAlt;
  for (let iter = 0; iter < 40; iter++) {
    const mid = (l + h) / 2;
    const midDate = dateAtHourOfDay(base, mid);
    const midAlt = sunAltDeg(midDate, lat, lon);
    if ((lAlt - ASTRO_NIGHT_ALT) * (midAlt - ASTRO_NIGHT_ALT) <= 0) {
      h = mid;
    } else {
      l = mid;
      lAlt = midAlt;
    }
    if ((h - l) * 3600 < 1) break; // < 1 second
  }
  return dateAtHourOfDay(base, (l + h) / 2);
}

/**
 * Combined gradient + night-window analysis. Both outputs derive from the same
 * coarse-step altitude table so the day's sun position is only sampled ~290
 * times per (date, location) change instead of ~330 (288 + 37).
 */
export function analyzeDay(date: Date, latRad: number, lonRad: number): DayAnalysis {
  const alts = new Float32Array(STEPS_PER_DAY + 1);
  for (let i = 0; i <= STEPS_PER_DAY; i++) {
    const hour = (i * STEP_MINUTES) / 60;
    alts[i] = sunAltDeg(dateAtHourOfDay(date, hour), latRad, lonRad);
  }

  // Gradient — slider position i → alt-table index (offset + i*8) mod 288.
  const stops: string[] = [];
  for (let i = 0; i <= GRADIENT_STOPS; i++) {
    const idx = (GRADIENT_INDEX_OFFSET + i * STEPS_PER_GRADIENT_STOP) % STEPS_PER_DAY;
    const { outer } = skyColorsFor(alts[idx]);
    const pct = (i / GRADIENT_STOPS) * 100;
    stops.push(`${outer} ${pct.toFixed(2)}%`);
  }
  const gradient = `linear-gradient(90deg, ${stops.join(', ')})`;

  let beginPct: number | null = null;
  let endPct: number | null = null;

  for (let i = 1; i <= STEPS_PER_DAY; i++) {
    if (alts[i - 1] <= ASTRO_NIGHT_ALT && alts[i] > ASTRO_NIGHT_ALT) {
      const lo = ((i - 1) * STEP_MINUTES) / 60;
      const hi = (i * STEP_MINUTES) / 60;
      const cross = bisectCrossing(date, latRad, lonRad, lo, hi, alts[i - 1]);
      endPct = timeOfDayToPct(cross);
      break;
    }
  }

  for (let i = STEPS_PER_DAY; i >= 1; i--) {
    if (alts[i - 1] > ASTRO_NIGHT_ALT && alts[i] <= ASTRO_NIGHT_ALT) {
      const lo = ((i - 1) * STEP_MINUTES) / 60;
      const hi = (i * STEP_MINUTES) / 60;
      const cross = bisectCrossing(date, latRad, lonRad, lo, hi, alts[i - 1]);
      beginPct = timeOfDayToPct(cross);
      break;
    }
  }

  // The slider spans midnight-centred, so its left edge is noon today and
  // the right edge is noon tomorrow. Sample the moon on that **same axis**
  // (not on hour-of-today, which wraps mid-array and produces a horizontal
  // jump at noon). Slider X is therefore monotonic in both time and pct.
  const MOON_SAMPLES = 144; // 10-min resolution
  const baseNoon = dateAtHourOfDay(date, 12);
  const baseNoonMs = baseNoon.getTime();
  const malts = new Float32Array(MOON_SAMPLES + 1);
  for (let i = 0; i <= MOON_SAMPLES; i++) {
    const t = new Date(baseNoonMs + (i / MOON_SAMPLES) * 24 * 3600 * 1000);
    malts[i] = moonAltDeg(t, latRad, lonRad);
  }
  const xForI = (i: number): number => (i / MOON_SAMPLES) * 100;

  const RIBBON_H = 24;
  const RIBBON_TOP_PAD = 2;
  const ALT_CAP = 80; // ribbon saturates at 80° altitude — most of moon's range
  const baseY = RIBBON_H;
  const yFor = (alt: number): number =>
    baseY - Math.max(0, Math.min(ALT_CAP, alt)) / ALT_CAP * (RIBBON_H - RIBBON_TOP_PAD);

  const events: { kind: 'rise' | 'set'; pct: number }[] = [];
  let fillPath = '';
  let linePath = '';
  let inSeg = false;

  for (let i = 0; i < malts.length; i++) {
    const alt = malts[i];
    const x = xForI(i);
    if (alt > 0) {
      if (!inSeg) {
        if (i === 0) {
          // Moon already up at the left edge — open-edge curve. No phantom
          // rise event at x=0; the fill is anchored to the baseline only so
          // the SVG remains a closed area below the curve.
          fillPath += `M 0,${baseY} L 0,${yFor(alt).toFixed(2)} `;
          linePath += `M 0,${yFor(alt).toFixed(2)} `;
        } else {
          // Real rise crossing inside (i-1, i].
          const prevAlt = malts[i - 1];
          const prevX = xForI(i - 1);
          const t = -prevAlt / (alt - prevAlt);
          const xR = prevX + t * (x - prevX);
          events.push({ kind: 'rise', pct: xR / 100 });
          fillPath += `M ${xR.toFixed(2)},${baseY} L ${x.toFixed(2)},${yFor(alt).toFixed(2)} `;
          linePath += `M ${xR.toFixed(2)},${baseY} L ${x.toFixed(2)},${yFor(alt).toFixed(2)} `;
        }
        inSeg = true;
      } else {
        fillPath += `L ${x.toFixed(2)},${yFor(alt).toFixed(2)} `;
        linePath += `L ${x.toFixed(2)},${yFor(alt).toFixed(2)} `;
      }
    } else if (inSeg) {
      const prevAlt = malts[i - 1];
      const prevX = xForI(i - 1);
      const t = prevAlt / (prevAlt - alt);
      const xS = prevX + t * (x - prevX);
      events.push({ kind: 'set', pct: xS / 100 });
      fillPath += `L ${xS.toFixed(2)},${baseY} Z `;
      linePath += `L ${xS.toFixed(2)},${baseY} `;
      inSeg = false;
    }
  }
  if (inSeg) {
    // Moon still up at the right edge — close fill to the baseline at x=100,
    // no event.
    fillPath += `L 100,${baseY} Z `;
  }

  const phaseRep = moonRaDec(julianDate(baseNoon)).phaseFrac;

  return {
    gradient,
    night: { beginPct, endPct },
    moon: { fillPath, linePath, events, phaseRep },
  };
}
