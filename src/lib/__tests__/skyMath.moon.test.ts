import { describe, expect, test } from 'vitest';
import { julianDate } from '../skyMath';
import {
  moonRaDec,
  phaseKey,
  moonLitPath,
  MOON_PHASE_KEYS,
} from '../skyMath.moon';

const DEG = Math.PI / 180;

describe('moonRaDec', () => {
  test('stays inside the zodiac belt (|dec| < 30°) across a synodic month', () => {
    const start = Date.UTC(2025, 0, 1, 0, 0, 0);
    for (let d = 0; d < 35; d++) {
      const jd = julianDate(new Date(start + d * 86400000));
      const m = moonRaDec(jd);
      expect(m.raRad).toBeGreaterThanOrEqual(0);
      expect(m.raRad).toBeLessThan(2 * Math.PI);
      expect(m.decRad / DEG).toBeGreaterThan(-30);
      expect(m.decRad / DEG).toBeLessThan(30);
    }
  });

  test('RA sweeps a wide arc over a synodic month', () => {
    const start = Date.UTC(2025, 0, 1, 0, 0, 0);
    let minRa = Infinity, maxRa = -Infinity;
    for (let d = 0; d < 30; d++) {
      const jd = julianDate(new Date(start + d * 86400000));
      const ra = moonRaDec(jd).raRad;
      if (ra < minRa) minRa = ra;
      if (ra > maxRa) maxRa = ra;
    }
    // Crude: over 30 days RA wraps, so a single (max - min) ≥ ~3 rad confirms motion.
    expect(maxRa - minRa).toBeGreaterThan(3);
  });

  test('illumination tracks phase: new ≈ 0, full ≈ 1', () => {
    // 2024-12-30 22:27 UTC — published new moon.
    const jdNew = julianDate(new Date(Date.UTC(2024, 11, 30, 22, 27, 0)));
    const near = moonRaDec(jdNew);
    expect(near.illumination).toBeLessThan(0.03);

    // 2025-01-13 22:26 UTC — published full moon.
    const jdFull = julianDate(new Date(Date.UTC(2025, 0, 13, 22, 26, 0)));
    const full = moonRaDec(jdFull);
    expect(full.illumination).toBeGreaterThan(0.97);
  });

  test('phaseFrac waxes from 0 toward 0.5, then wanes past 0.5', () => {
    const a = moonRaDec(julianDate(new Date(Date.UTC(2025, 0, 3, 0, 0, 0))));
    const b = moonRaDec(julianDate(new Date(Date.UTC(2025, 0, 7, 0, 0, 0))));
    expect(b.phaseFrac).toBeGreaterThan(a.phaseFrac);
    expect(b.phaseFrac).toBeLessThan(0.5);

    const c = moonRaDec(julianDate(new Date(Date.UTC(2025, 0, 16, 0, 0, 0))));
    expect(c.phaseFrac).toBeGreaterThan(0.5);
  });
});

describe('phaseKey', () => {
  test('maps thresholds to canonical keys', () => {
    expect(phaseKey(0.0)).toBe(MOON_PHASE_KEYS.NEW);
    expect(phaseKey(0.15)).toBe(MOON_PHASE_KEYS.WAX_CRES);
    expect(phaseKey(0.25)).toBe(MOON_PHASE_KEYS.FIRST_QTR);
    expect(phaseKey(0.40)).toBe(MOON_PHASE_KEYS.WAX_GIB);
    expect(phaseKey(0.50)).toBe(MOON_PHASE_KEYS.FULL);
    expect(phaseKey(0.60)).toBe(MOON_PHASE_KEYS.WAN_GIB);
    expect(phaseKey(0.75)).toBe(MOON_PHASE_KEYS.LAST_QTR);
    expect(phaseKey(0.85)).toBe(MOON_PHASE_KEYS.WAN_CRES);
    expect(phaseKey(0.99)).toBe(MOON_PHASE_KEYS.NEW);
  });
});

describe('moonLitPath', () => {
  test('returns a non-empty SVG path string for waxing and waning halves', () => {
    expect(moonLitPath(0.25, 10)).toMatch(/^M /);
    expect(moonLitPath(0.75, 10)).toMatch(/^M /);
  });
});
