import { describe, expect, it } from 'vitest';
import { bvToRGB } from '../bvToRGB';

describe('bvToRGB', () => {
  it('returns bluish-white for very low B−V (hot O/B star)', () => {
    const [r, , b] = bvToRGB(-0.3);
    expect(b).toBeGreaterThan(r);
  });

  it('returns near-white for sun-like B−V ≈ 0.65', () => {
    const [r, g, b] = bvToRGB(0.65);
    // R, G, B should be roughly similar (within 0.15 of each other)
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    expect(max - min).toBeLessThan(0.2);
  });

  it('returns reddish for high B−V (cool M star, B−V ≈ 1.5)', () => {
    const [r, , b] = bvToRGB(1.5);
    expect(r).toBeGreaterThan(b);
  });

  it('clamps outputs to [0, 1]', () => {
    for (const bv of [-1, -0.5, 0, 0.5, 1, 2, 3]) {
      const rgb = bvToRGB(bv);
      for (const c of rgb) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    }
  });
});
