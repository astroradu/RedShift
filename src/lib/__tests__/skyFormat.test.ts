import { describe, expect, test } from 'vitest';
import {
  formatAlt,
  formatArcmin,
  formatAz,
  formatDec,
  formatRA,
} from '../skyFormat';

const DEG = Math.PI / 180;
const RA_HOURS_TO_RAD = Math.PI / 12;

describe('formatRA', () => {
  test('renders Vega coordinates', () => {
    // Vega RA = 18h 36m 56.34s
    const ra = (18 + 36 / 60 + 56.34 / 3600) * RA_HOURS_TO_RAD;
    expect(formatRA(ra)).toBe('18h 36m 56s');
  });
  test('rounds seconds up past the 60-boundary', () => {
    // 23h 59m 59.7s rounds to 00h 00m 00s (next day wraps to 0).
    const ra = (23 + 59 / 60 + 59.7 / 3600) * RA_HOURS_TO_RAD;
    expect(formatRA(ra)).toBe('00h 00m 00s');
  });
  test('normalises negative RA into [0, 24h)', () => {
    expect(formatRA(-1 * RA_HOURS_TO_RAD)).toBe('23h 00m 00s');
  });
});

describe('formatDec', () => {
  test('renders Vega declination', () => {
    // Dec = +38° 47' 01"
    const dec = (38 + 47 / 60 + 1 / 3600) * DEG;
    expect(formatDec(dec)).toBe('+38°47\'01"');
  });
  test('renders southern declination with the unicode minus', () => {
    const dec = -(45 + 30 / 60) * DEG;
    expect(formatDec(dec)).toBe('−45°30\'00"');
  });
  test('rounds seconds up past the 60-boundary', () => {
    const dec = (44 + 59 / 60 + 59.7 / 3600) * DEG;
    expect(formatDec(dec)).toBe('+45°00\'00"');
  });
});

describe('formatAlt', () => {
  test('signed one-decimal degrees', () => {
    expect(formatAlt(45 * DEG)).toBe('+45.0°');
    expect(formatAlt(-12.345 * DEG)).toBe('−12.3°');
  });
});

describe('formatAz', () => {
  test('integer degrees in [0, 360)', () => {
    expect(formatAz(0)).toBe('0°');
    expect(formatAz(180 * DEG)).toBe('180°');
    expect(formatAz(360 * DEG)).toBe('0°');
    expect(formatAz(-90 * DEG)).toBe('270°');
  });
});

describe('formatArcmin', () => {
  test('one-decimal arcminute prime', () => {
    expect(formatArcmin(190.523)).toBe("190.5'");
    expect(formatArcmin(0.1)).toBe("0.1'");
  });
  test('returns em-dash for missing / invalid values', () => {
    expect(formatArcmin(null)).toBe('—');
    expect(formatArcmin(undefined)).toBe('—');
    expect(formatArcmin(-1)).toBe('—');
    expect(formatArcmin(NaN)).toBe('—');
  });
});
