import { describe, expect, it } from 'vitest';
import { julianDate, gmst, lst, raDecToAltAz } from '../skyMath';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

function modTau(x: number): number {
  let v = x % TAU;
  if (v < 0) v += TAU;
  return v;
}

describe('julianDate', () => {
  it('matches the known JD for J2000 epoch (2000-01-01 12:00 UTC)', () => {
    const jd = julianDate(new Date(Date.UTC(2000, 0, 1, 12, 0, 0)));
    expect(jd).toBeCloseTo(2451545.0, 5);
  });
});

describe('gmst', () => {
  it('returns ~18.697 hours (= ~4.895 rad) at J2000 epoch', () => {
    const g = gmst(2451545.0);
    // GMST at J2000 ≈ 18.697374558 sidereal hours ≈ 4.894961... rad
    expect(modTau(g)).toBeCloseTo(4.8949612, 3);
  });
});

describe('lst', () => {
  it('subtracts (rather: adds eastward lon) from GMST', () => {
    const jd = 2451545.0;
    const east45 = lst(jd, 45 * DEG);
    const g = gmst(jd);
    expect(modTau(east45 - g)).toBeCloseTo(modTau(45 * DEG), 5);
  });
});

describe('raDecToAltAz', () => {
  it('puts the zenith at alt=π/2 (observer-at-pole edge case)', () => {
    // For a pole observer (lat = π/2), anything at dec = π/2 is at the zenith.
    const { altRad } = raDecToAltAz(0, Math.PI / 2, 0, Math.PI / 2);
    expect(altRad).toBeCloseTo(Math.PI / 2, 5);
  });

  it('horizon star: dec=0, hour-angle=π/2, lat=0 → alt=0', () => {
    // Star on the celestial equator, 6h east of meridian, equatorial observer.
    // LST - RA = π/2  →  put RA = 0, LST = π/2.
    const { altRad } = raDecToAltAz(0, 0, Math.PI / 2, 0);
    expect(altRad).toBeCloseTo(0, 5);
  });
});
