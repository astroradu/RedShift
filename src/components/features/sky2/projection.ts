/**
 * CPU mirror of the GLSL `projGLSL` chunk in `shaders.ts`.
 *
 * Why this exists: DOM overlays (labels, tooltips) and click hit-testing live
 * outside the WebGL pipeline, so they cannot rely on `gl_Position`. They need
 * a TypeScript implementation that lands a world-space point on the *exact*
 * same pixel the vertex shader does — across rect, fisheye, and stereographic
 * projection modes.
 *
 * Coordinate convention (matches Sky Viewer's existing convention, see
 * CLAUDE.md "Sky Viewer" section):
 *   - Observer frame: +X east, +Y up, +Z south.
 *   - Camera at origin with default rotation; three.js's -Z is forward.
 *   - "In front of camera" is `vp.z < 0`, "behind" is `vp.z >= 0`.
 *   - Screen +y goes down (standard DOM/canvas), so we flip Y when converting
 *     from NDC to screen pixels.
 *
 * The values in PROJ_MODE_NUM are the same integers fed to the shader's
 * `uProjMode` uniform, so this module is the single source of truth for that
 * encoding across CPU and GPU.
 */

import type { XYZ } from './starsData';

export const PROJ_MODE_NUM = { rect: 0, fisheye: 1, stereo: 2 } as const;
export type ProjModeNum = typeof PROJ_MODE_NUM[keyof typeof PROJ_MODE_NUM];

// Numerical safety margins. Mirror the equivalents in `projGLSL` exactly —
// changing these here without updating the shader will desync overlays from
// the rendered scene.
const RECT_BEHIND_EPS = 1e-4;   // points within this of the camera plane are treated as behind
const FISH_DIR_EPS = 1e-5;      // guards 1/r and horiz-normalization when a point coincides with the camera
const STEREO_DENOM_EPS = 1e-3;  // stereographic blows up as denom→0 (the antipode); mark invisible past this

export interface ScreenPoint {
  /** Screen-space X in pixels (0 = left edge). */
  x: number;
  /** Screen-space Y in pixels (0 = top edge). */
  y: number;
  /** False when the point is behind the camera (rect) or at a projection singularity (stereo). */
  visible: boolean;
}

export interface ProjectArgs {
  /** Camera yaw in radians (rotation about world +Y). */
  yaw: number;
  /** Camera pitch in radians (rotation about world +X). */
  pitch: number;
  /** Vertical field of view in degrees. */
  fovDeg: number;
  /** Which projection to apply — must match the shader's `uProjMode` value. */
  projMode: ProjModeNum;
  viewportW: number;
  viewportH: number;
}

/**
 * Apply the inverse of the camera's world rotation to a world-space point,
 * yielding the point in view space.
 *
 * particleScene.ts sets `camera.rotation.order = 'YXZ'`, so three.js builds the
 * camera's world matrix as `Ry(yaw) · Rx(pitch)`. The viewMatrix is its inverse
 * `Rx(-pitch) · Ry(-yaw)`. Applied to a world point p, view = Rx(-pitch) ·
 * (Ry(-yaw) · p) — yaw first, then pitch, both negated.
 *
 * Sanity check: at pitch=+π/2 (camera looking up at zenith), the world's
 * forward star at (0,0,-1) ends up behind/below the camera at view (0,-1,0).
 * At yaw=+π/2 (camera looking left), that same star ends up to the camera's
 * right at view (+1,0,0).
 */
export function viewSpaceFromWorld(p: XYZ, yaw: number, pitch: number): XYZ {
  // Step 1: Ry(-yaw) applied to (x,y,z):
  //   x' = cos(-yaw)·x + sin(-yaw)·z
  //   z' = -sin(-yaw)·x + cos(-yaw)·z
  const cy = Math.cos(-yaw);
  const sy = Math.sin(-yaw);
  const x1 =  cy * p.x + sy * p.z;
  const y1 =  p.y;
  const z1 = -sy * p.x + cy * p.z;

  // Step 2: Rx(-pitch) applied to (x,y,z):
  //   y' = cos(-pitch)·y - sin(-pitch)·z
  //   z' = sin(-pitch)·y + cos(-pitch)·z
  const cp = Math.cos(-pitch);
  const sp = Math.sin(-pitch);
  const x2 = x1;
  const y2 = cp * y1 - sp * z1;
  const z2 = sp * y1 + cp * z1;

  return { x: x2, y: y2, z: z2 };
}

/**
 * Project a world-space point to screen pixels for the active projection
 * mode. Matches the GLSL `projectPoint` function in `shaders.ts` bit for bit;
 * any divergence here means DOM overlays drift away from the rendered stars.
 */
export function projectWorldToScreen(p: XYZ, args: ProjectArgs): ScreenPoint {
  const vp = viewSpaceFromWorld(p, args.yaw, args.pitch);

  // NDC → screen pixels. NDC is in [-1, 1] with +y up; the DOM screen has +y
  // down, so we flip Y here. Centered at viewport center.
  const toScreen = (ndcX: number, ndcY: number): ScreenPoint => ({
    x: (ndcX * 0.5 + 0.5) * args.viewportW,
    y: (1 - (ndcY * 0.5 + 0.5)) * args.viewportH,
    visible: true,
  });

  // --- Rectilinear: a standard perspective projection ---
  // Equivalent to multiplying by `projectionMatrix` in the shader path.
  // Anything at or behind the camera plane (z >= 0 in view space, with a tiny
  // epsilon) is invisible — no rect projection past the principal point.
  if (args.projMode === PROJ_MODE_NUM.rect) {
    if (vp.z >= -RECT_BEHIND_EPS) return { x: 0, y: 0, visible: false };

    // f = cot(halfFovY) is the focal length expressed in NDC-Y units. We
    // halve the full FOV once and then halve again because the formula is
    // tan(fov_in_radians / 2); folded into a single (fovDeg * π / 360).
    const halfFovY = (args.fovDeg * Math.PI) / 360;
    const f = 1 / Math.tan(halfFovY);
    const aspect = args.viewportW / args.viewportH;

    // Divide by -vp.z to project onto the image plane in front of the camera
    // (camera looks down -Z). +X view-space is camera-right (standard three.js
    // right-handed convention), so a +X point lands on the right half — no
    // extra sign flip needed.
    const ndcX = (f / aspect) * (vp.x / -vp.z);
    const ndcY = f * (vp.y / -vp.z);
    return toScreen(ndcX, ndcY);
  }

  // --- Shared setup for fisheye and stereo: normalize the view-space vector
  //     onto the unit sphere. r→0 means the point is at the camera; we treat
  //     that as not displayable (it has no defined direction).
  const r = Math.sqrt(vp.x * vp.x + vp.y * vp.y + vp.z * vp.z);
  if (r < FISH_DIR_EPS) return { x: 0, y: 0, visible: false };
  const dx = vp.x / r;
  const dy = vp.y / r;
  const dz = vp.z / r;
  // fz is "forwardness": cos(angle between point direction and camera-forward).
  // +1 = directly in front, 0 = on the equator, -1 = directly behind.
  const fz = -dz;
  const halfFovY = (args.fovDeg * Math.PI) / 360;
  const aspect = args.viewportW / args.viewportH;

  // --- Fisheye (equidistant): angular distance from forward maps linearly to
  //     radius from screen center. Handles FOVs > 180° natively — a point
  //     directly behind sits at radius `π / halfFovY` from center.
  if (args.projMode === PROJ_MODE_NUM.fisheye) {
    // theta = angle between the point direction and camera-forward, in [0, π].
    // Clamp guards floating-point drift in fz that could push acos out of domain.
    const theta = Math.acos(Math.max(-1, Math.min(1, fz)));

    // Horizontal direction on the screen plane (x,y of the unit vector,
    // normalized to a 2D unit). When hl is too small (point is on the
    // forward/backward axis) we fall back to the origin direction.
    const hl = Math.sqrt(dx * dx + dy * dy);
    const horizX = hl > FISH_DIR_EPS ? dx / hl : 0;
    const horizY = hl > FISH_DIR_EPS ? dy / hl : 0;

    // rp ∈ [0, ...] is angular distance normalized so that halfFovY maps to 1
    // (the screen-edge in NDC-Y).
    const rp = theta / halfFovY;
    const ndcX = (horizX * rp) / aspect;
    const ndcY = horizY * rp;
    return toScreen(ndcX, ndcY);
  }

  // --- Stereographic: conformal projection from the antipode. Diverges as
  //     the point approaches "directly behind the camera" (denom → 0), so we
  //     mark anything close to the antipode as invisible rather than letting
  //     it explode to infinity on screen.
  const denom = 1 + fz;
  if (denom < STEREO_DENOM_EPS) return { x: 0, y: 0, visible: false };

  // scale derives from matching the standard stereographic UV layout to the
  // requested FOV: at half-FOV, the projected radius is 1 (NDC edge).
  const scale = 1 / (2 * Math.tan(halfFovY * 0.5));
  const ndcX = (dx * 2 * scale) / denom / aspect;
  const ndcY = (dy * 2 * scale) / denom;
  return toScreen(ndcX, ndcY);
}
