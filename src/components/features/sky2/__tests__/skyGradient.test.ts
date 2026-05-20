import { describe, expect, test } from 'vitest';
import { sunAltDeg } from '../../../../lib/skyMath';
import { analyzeDay, skyColorsFor, SKY_STOPS } from '../skyGradient';

const DEG = Math.PI / 180;

// Build a Date for a specific local clock time. The implementation uses local
// time (Date#setHours), so the harness must build local-time dates too.
function localDate(year: number, month1: number, day: number, hour = 12): Date {
  return new Date(year, month1 - 1, day, hour, 0, 0, 0);
}

describe('sunAltDeg', () => {
  test('near zenith at the equator near equinox solar noon', () => {
    // 2026-03-20, observer at lat 0, lon 0, UT noon (≈ solar noon at lon 0).
    // The actual equinox isn't exactly at this instant and the equation of
    // time shifts solar noon by a few minutes either way, but the sun should
    // be unambiguously near the zenith (>85°).
    const d = new Date('2026-03-20T12:00:00Z');
    expect(sunAltDeg(d, 0, 0)).toBeGreaterThan(85);
    expect(sunAltDeg(d, 0, 0)).toBeLessThanOrEqual(90);
  });
  test('positive at noon, negative at midnight (40°N summer)', () => {
    const noon     = new Date('2026-06-21T16:00:00Z'); // ≈ local noon at lon -60° = -4h
    const midnight = new Date('2026-06-22T04:00:00Z');
    expect(sunAltDeg(noon,     40 * DEG, -60 * DEG)).toBeGreaterThan(60);
    expect(sunAltDeg(midnight, 40 * DEG, -60 * DEG)).toBeLessThan(-10);
  });
});

describe('skyColorsFor', () => {
  test('returns the floor stop for very deep night', () => {
    const c = skyColorsFor(-90);
    expect(c.outer).toBe(`rgb(${SKY_STOPS[0].outer[0]}, ${SKY_STOPS[0].outer[1]}, ${SKY_STOPS[0].outer[2]})`);
  });
  test('returns the ceiling stop for high midday sun', () => {
    const c = skyColorsFor(90);
    const last = SKY_STOPS[SKY_STOPS.length - 1];
    expect(c.outer).toBe(`rgb(${last.outer[0]}, ${last.outer[1]}, ${last.outer[2]})`);
  });
  test('interpolates linearly between stops', () => {
    // -18 (idx 0) is dark; -8 (idx 1) is twilight. Midpoint should be between.
    const lo = skyColorsFor(-18);
    const mid = skyColorsFor(-13);
    const hi = skyColorsFor(-8);
    expect(mid).not.toBe(lo);
    expect(mid).not.toBe(hi);
  });
});

describe('analyzeDay', () => {
  test('produces a gradient string with 37 stops', () => {
    const r = analyzeDay(localDate(2026, 3, 20, 12), 0, 0);
    // 37 comma-separated stops inside `linear-gradient(90deg, …)`.
    const inner = r.gradient.match(/^linear-gradient\(90deg,\s*(.*)\)$/);
    expect(inner).not.toBeNull();
    const stopCount = inner![1].split(/,\s*rgb\(/).length;
    expect(stopCount).toBe(37);
  });
  test('mid-latitude winter day produces two anchors', () => {
    // 40°N on Dec solstice — astronomical night exists. Position depends on
    // the test machine's timezone (analyzeDay uses local clock for the
    // slider mapping), so we don't assert specific pcts here; only that both
    // crossings were found.
    const r = analyzeDay(localDate(2026, 12, 21), 40 * DEG, -75 * DEG);
    expect(r.night.beginPct).not.toBeNull();
    expect(r.night.endPct).not.toBeNull();
  });
  test('high-latitude summer ("white nights") has no anchors', () => {
    // 60°N on June solstice — sun stays above -18° all night.
    const r = analyzeDay(localDate(2026, 6, 21), 60 * DEG, 0);
    expect(r.night.beginPct).toBeNull();
    expect(r.night.endPct).toBeNull();
  });
  test('polar winter (sun never above -18°) has no anchors', () => {
    // 88°N on Dec solstice — max sun altitude = -(lat - 23.44°) ≈ -64.6°,
    // far below the -18° threshold. Sun never rises through it.
    const r = analyzeDay(localDate(2026, 12, 21), 88 * DEG, 0);
    expect(r.night.beginPct).toBeNull();
    expect(r.night.endPct).toBeNull();
  });
});


describe('analyzeDay — moon ribbon', () => {
  test('temperate-lat day yields a finite ribbon with valid events', () => {
    // 40°N, 74°W on 2025-03-15.
    const r = analyzeDay(localDate(2025, 3, 15), 40 * DEG, -74 * DEG);
    expect(typeof r.moon.fillPath).toBe('string');
    expect(typeof r.moon.linePath).toBe('string');
    r.moon.events.forEach((e) => {
      expect(e.pct).toBeGreaterThanOrEqual(0);
      expect(e.pct).toBeLessThanOrEqual(1);
      expect(e.kind === 'rise' || e.kind === 'set').toBe(true);
    });
  });

  test('phaseRep is a finite phase fraction in [0, 1)', () => {
    const r = analyzeDay(localDate(2025, 3, 15), 40 * DEG, -74 * DEG);
    expect(Number.isFinite(r.moon.phaseRep)).toBe(true);
    expect(r.moon.phaseRep).toBeGreaterThanOrEqual(0);
    expect(r.moon.phaseRep).toBeLessThan(1);
  });

  test('produces non-empty fill on a day where the moon is up at all', () => {
    // Sweep a synodic month; at temperate latitudes, almost every day has
    // some up-time, so at least one day in the sweep must yield a non-empty
    // fill path. This guards the path generator without assuming a specific
    // rise/set time.
    let anyFill = false;
    for (let d = 0; d < 30; d++) {
      const r = analyzeDay(localDate(2025, 3, 1 + d), 40 * DEG, -74 * DEG);
      if (r.moon.fillPath.length > 0) { anyFill = true; break; }
    }
    expect(anyFill).toBe(true);
  });
});
