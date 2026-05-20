import { describe, expect, it } from 'vitest';
import { projectWorldToScreen, viewSpaceFromWorld, PROJ_MODE_NUM } from '../projection';

const PIXEL_EPS = 0.5;

describe('viewSpaceFromWorld', () => {
  it('passes through unchanged at yaw=0,pitch=0', () => {
    const vp = viewSpaceFromWorld({ x: 1, y: 2, z: -3 }, 0, 0);
    expect(vp.x).toBeCloseTo(1, 6);
    expect(vp.y).toBeCloseTo(2, 6);
    expect(vp.z).toBeCloseTo(-3, 6);
  });

  it('rotates a forward point under yaw=π/2 to the +X view axis', () => {
    const vp = viewSpaceFromWorld({ x: 0, y: 0, z: -1 }, Math.PI / 2, 0);
    expect(vp.x).toBeCloseTo(1, 6);
    expect(vp.y).toBeCloseTo(0, 6);
    expect(vp.z).toBeCloseTo(0, 6);
  });

  it('rotates a forward point under pitch=+π/2 (camera looking up) to view (0,-1,0)', () => {
    // three.js: worldMatrix = Ry(yaw)·Rx(pitch); viewMatrix = Rx(-pitch)·Ry(-yaw).
    // At pitch=+π/2 the camera tilts back to look at zenith. The world's
    // forward star at (0,0,-1) is now behind/below the camera, projecting to
    // view-space y=-1.
    const vp = viewSpaceFromWorld({ x: 0, y: 0, z: -1 }, 0, Math.PI / 2);
    expect(vp.x).toBeCloseTo(0, 6);
    expect(vp.y).toBeCloseTo(-1, 6);
    expect(vp.z).toBeCloseTo(0, 6);
  });

  it('matches three.js viewMatrix at a non-trivial pitch (regression for sign-flip bug)', () => {
    // Independent computation: at yaw=0, pitch=+0.3, the world point (0,0,-100)
    // should land in view space at (0, -100·sin(0.3), -100·cos(0.3)) — the
    // camera tilts back so a forward star drops below the optical axis.
    const vp = viewSpaceFromWorld({ x: 0, y: 0, z: -100 }, 0, 0.3);
    expect(vp.x).toBeCloseTo(0, 5);
    expect(vp.y).toBeCloseTo(-100 * Math.sin(0.3), 4);
    expect(vp.z).toBeCloseTo(-100 * Math.cos(0.3), 4);
  });
});

describe('projectWorldToScreen (rect)', () => {
  it('lands a forward point at viewport center', () => {
    const W = 800, H = 600;
    const p = projectWorldToScreen(
      { x: 0, y: 0, z: -100 },
      { yaw: 0, pitch: 0, fovDeg: 60, projMode: PROJ_MODE_NUM.rect, viewportW: W, viewportH: H },
    );
    expect(p.visible).toBe(true);
    expect(p.x).toBeCloseTo(W / 2, PIXEL_EPS);
    expect(p.y).toBeCloseTo(H / 2, PIXEL_EPS);
  });

  it('marks a behind-camera point as invisible (rect)', () => {
    const p = projectWorldToScreen(
      { x: 0, y: 0, z: 50 },
      { yaw: 0, pitch: 0, fovDeg: 60, projMode: PROJ_MODE_NUM.rect, viewportW: 800, viewportH: 600 },
    );
    expect(p.visible).toBe(false);
  });

  it('places +X view-space on the right half (three.js: +X is camera-right)', () => {
    const p = projectWorldToScreen(
      { x: 10, y: 0, z: -100 },
      { yaw: 0, pitch: 0, fovDeg: 60, projMode: PROJ_MODE_NUM.rect, viewportW: 800, viewportH: 600 },
    );
    expect(p.visible).toBe(true);
    expect(p.x).toBeGreaterThan(400);
  });

  it('places +Y view-space above center (screen +y goes down)', () => {
    const p = projectWorldToScreen(
      { x: 0, y: 10, z: -100 },
      { yaw: 0, pitch: 0, fovDeg: 60, projMode: PROJ_MODE_NUM.rect, viewportW: 800, viewportH: 600 },
    );
    expect(p.visible).toBe(true);
    expect(p.y).toBeLessThan(300);
  });
});

describe('projectWorldToScreen (fisheye)', () => {
  it('lands a forward point at viewport center', () => {
    const p = projectWorldToScreen(
      { x: 0, y: 0, z: -1 },
      { yaw: 0, pitch: 0, fovDeg: 160, projMode: PROJ_MODE_NUM.fisheye, viewportW: 800, viewportH: 600 },
    );
    expect(p.visible).toBe(true);
    expect(p.x).toBeCloseTo(400, PIXEL_EPS);
    expect(p.y).toBeCloseTo(300, PIXEL_EPS);
  });

  it('keeps a point directly behind the camera reachable on a 180+° fisheye', () => {
    const p = projectWorldToScreen(
      { x: 0, y: 0, z: 1 },
      { yaw: 0, pitch: 0, fovDeg: 200, projMode: PROJ_MODE_NUM.fisheye, viewportW: 800, viewportH: 600 },
    );
    expect(p.visible).toBe(true);
  });
});

describe('projectWorldToScreen (stereo)', () => {
  it('lands a forward point at viewport center', () => {
    const p = projectWorldToScreen(
      { x: 0, y: 0, z: -1 },
      { yaw: 0, pitch: 0, fovDeg: 130, projMode: PROJ_MODE_NUM.stereo, viewportW: 800, viewportH: 600 },
    );
    expect(p.visible).toBe(true);
    expect(p.x).toBeCloseTo(400, PIXEL_EPS);
    expect(p.y).toBeCloseTo(300, PIXEL_EPS);
  });

  it('flags the stereographic singularity (point directly behind camera) as invisible', () => {
    const p = projectWorldToScreen(
      { x: 0, y: 0, z: 1 },
      { yaw: 0, pitch: 0, fovDeg: 130, projMode: PROJ_MODE_NUM.stereo, viewportW: 800, viewportH: 600 },
    );
    expect(p.visible).toBe(false);
  });
});
