import { describe, expect, test } from 'vitest';
import { shortestYawDelta } from '../cameraTween';

const PI = Math.PI;

describe('shortestYawDelta', () => {
  test('no wrap for small forward delta', () => {
    expect(shortestYawDelta(0, 0.5)).toBeCloseTo(0.5, 10);
  });

  test('no wrap just under +π', () => {
    expect(shortestYawDelta(0, PI - 0.01)).toBeCloseTo(PI - 0.01, 10);
  });

  test('goes the short (negative) way when target is just past -π', () => {
    // dy must be ≈ -(π - 0.01), NOT +(π + 0.01) the long way around.
    const dy = shortestYawDelta(0, -PI + 0.01);
    expect(dy).toBeCloseTo(-PI + 0.01, 10);
    expect(dy).toBeLessThan(0);
  });

  test('takes the short way across the ±π seam', () => {
    // yaw = 3, target = -3. Long way is -6 rad; short way is +0.283 rad.
    const dy = shortestYawDelta(3, -3);
    expect(dy).toBeCloseTo(2 * PI - 6, 10);
    expect(Math.abs(dy)).toBeLessThan(PI);
  });

  test('absorbs full forward turns', () => {
    // Camera has been spun 5 full turns clockwise; target is π/4.
    expect(shortestYawDelta(10 * PI, PI / 4)).toBeCloseTo(PI / 4, 10);
  });

  test('absorbs full backward turns', () => {
    expect(shortestYawDelta(-10 * PI, PI / 4)).toBeCloseTo(PI / 4, 10);
  });

  test('result is always in [-π, π) across a sweep of inputs', () => {
    for (let from = -5 * PI; from <= 5 * PI; from += 0.37) {
      for (let to = -5 * PI; to <= 5 * PI; to += 0.41) {
        const dy = shortestYawDelta(from, to);
        expect(dy).toBeGreaterThanOrEqual(-PI);
        expect(dy).toBeLessThan(PI);
      }
    }
  });
});
