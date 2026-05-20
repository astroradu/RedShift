import { describe, expect, it } from 'vitest';
import { alignNotableToRendered, altAzToXyz, parsePackedStars, raDecToXyz, FIELD_STRIDE } from '../starsData';
import type { NotableStar } from '../../../../types';

function packRow(ra: number, dec: number, mag: number, ci: number, d: number): number[] {
  return [ra, dec, mag, ci, d];
}

function bufferOf(rows: number[][]): ArrayBuffer {
  const flat = rows.flat();
  return new Float32Array(flat).buffer;
}

describe('raDecToXyz', () => {
  it('places (RA=0, Dec=0) at -Z (forward at yaw=0)', () => {
    const v = raDecToXyz(0, 0, 10);
    expect(v.x).toBeCloseTo(0, 5);
    expect(v.y).toBeCloseTo(0, 5);
    expect(v.z).toBeCloseTo(-10, 5);
  });

  it('places Dec = +π/2 at +Y (north celestial pole up)', () => {
    const v = raDecToXyz(1.234, Math.PI / 2, 5);
    expect(v.x).toBeCloseTo(0, 5);
    expect(v.y).toBeCloseTo(5, 5);
    expect(v.z).toBeCloseTo(0, 5);
  });

  it('places (RA=π/2, Dec=0) at -X (east of forward)', () => {
    const v = raDecToXyz(Math.PI / 2, 0, 3);
    expect(v.x).toBeCloseTo(-3, 5);
    expect(v.y).toBeCloseTo(0, 5);
    expect(v.z).toBeCloseTo(0, 5);
  });

  it('preserves radius (length equals distance)', () => {
    const v = raDecToXyz(0.7, -0.4, 42);
    const len = Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2);
    expect(len).toBeCloseTo(42, 4);
  });
});

describe('parsePackedStars', () => {
  it('reads ra, dec, mag, color, distance per row at the documented stride', () => {
    const buf = bufferOf([
      packRow(0.1, 0.2, 1.5, 0.4, 100),
      packRow(0.3, -0.1, 2.0, 1.1, 200),
    ]);
    const out = parsePackedStars(buf, 2);
    expect(out.count).toBe(2);
    expect(out.positions[0]).toBeCloseTo(-100 * Math.cos(0.2) * Math.sin(0.1), 4);
    expect(out.positions[1]).toBeCloseTo(100 * Math.sin(0.2), 4);
    expect(out.positions[2]).toBeCloseTo(-100 * Math.cos(0.2) * Math.cos(0.1), 4);
    expect(out.mag[0]).toBeCloseTo(1.5, 5);
    expect(out.colorIndex[0]).toBeCloseTo(0.4, 5);
    expect(out.mag[1]).toBeCloseTo(2.0, 5);
  });

  it('skips rows where distance_ly is 0 (unknown)', () => {
    const buf = bufferOf([
      packRow(0.1, 0.2, 1.0, 0.5, 100),
      packRow(0.3, 0.1, 2.0, 0.6, 0),
      packRow(0.5, 0.0, 3.0, 0.7, 50),
    ]);
    const out = parsePackedStars(buf, 3);
    expect(out.count).toBe(2);
    expect(out.mag[0]).toBeCloseTo(1.0, 5);
    expect(out.mag[1]).toBeCloseTo(3.0, 5);
  });

  it('skips negative distances defensively', () => {
    const buf = bufferOf([
      packRow(0.1, 0.2, 1.0, 0.5, -1),
      packRow(0.3, 0.1, 2.0, 0.6, 10),
    ]);
    const out = parsePackedStars(buf, 2);
    expect(out.count).toBe(1);
    expect(out.mag[0]).toBeCloseTo(2.0, 5);
  });

  it('assigns aIndex monotonically 0..count-1 over the kept rows', () => {
    const buf = bufferOf([
      packRow(0.0, 0.0, 0.5, 0.0, 10),
      packRow(0.0, 0.0, 1.0, 0.0, 0),
      packRow(0.0, 0.0, 1.5, 0.0, 20),
      packRow(0.0, 0.0, 2.0, 0.0, 30),
    ]);
    const out = parsePackedStars(buf, 4);
    expect(Array.from(out.index)).toEqual([0, 1, 2]);
  });

  it('exposes a stride constant matching the backend layout', () => {
    expect(FIELD_STRIDE).toBe(5);
  });
});

function mkNotable(
  partial: Partial<NotableStar> & { ra_rad: number; dec_rad: number; mag: number; distance_ly: number },
): NotableStar {
  return {
    id: 0, name: 'Test', hd: null, hr: null, gliese: null,
    bayer_flamsteed: null, proper_name: null, abs_mag: null,
    spectrum: null, color_index: null,
    ...partial,
  };
}

describe('alignNotableToRendered', () => {
  it('aligns rank-by-rank when notable is the matching prefix', () => {
    const buf = (new Float32Array([
      0.1, 0.2, 1.5, 0.0, 100,
      0.3, -0.1, 2.0, 0.0, 200,
    ])).buffer;
    const parsed = parsePackedStars(buf, 2);
    const notable = [
      mkNotable({ ra_rad: 0.1,  dec_rad:  0.2,  mag: 1.5, distance_ly: 100, name: 'A' }),
      mkNotable({ ra_rad: 0.3,  dec_rad: -0.1,  mag: 2.0, distance_ly: 200, name: 'B' }),
    ];
    const aligned = alignNotableToRendered(parsed, notable);
    expect(aligned[0]?.name).toBe('A');
    expect(aligned[1]?.name).toBe('B');
  });

  it('returns null entries when no notable matches by coordinate', () => {
    const buf = (new Float32Array([1.0, 0.5, 3.0, 0.0, 50])).buffer;
    const parsed = parsePackedStars(buf, 1);
    const notable = [
      mkNotable({ ra_rad: 0.0, dec_rad: 0.0, mag: 3.0, distance_ly: 50, name: 'Other' }),
    ];
    const aligned = alignNotableToRendered(parsed, notable);
    expect(aligned[0]).toBeNull();
  });
});

describe('altAzToXyz', () => {
  it('places az=0 (north) at -Z at the horizon', () => {
    const v = altAzToXyz(0, 0, 10);
    expect(v.x).toBeCloseTo(0, 5);
    expect(v.y).toBeCloseTo(0, 5);
    expect(v.z).toBeCloseTo(-10, 5);
  });
  it('places alt=π/2 (zenith) at +Y regardless of az', () => {
    const v = altAzToXyz(Math.PI / 2, 1.23, 5);
    expect(v.x).toBeCloseTo(0, 5);
    expect(v.y).toBeCloseTo(5, 5);
    expect(v.z).toBeCloseTo(0, 5);
  });
  it('places az=π/2 (east) at +X', () => {
    const v = altAzToXyz(0, Math.PI / 2, 3);
    expect(v.x).toBeCloseTo(3, 5);
    expect(v.y).toBeCloseTo(0, 5);
    expect(v.z).toBeCloseTo(0, 5);
  });
});
