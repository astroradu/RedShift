/**
 * Shader-based Sun & Moon renderer for the sky2 scene.
 *
 * Adds five additive billboard quads (sun outer halo, sun inner halo, sun
 * disc, moon glow, moon disc). Each quad is positioned in NDC anchored to the
 * body's projected screen coordinate — the CPU mirror in `projection.ts` is
 * the source of truth, so bodies follow the same yaw/pitch/projection state
 * as the stars without routing through three.js's standard MVP pipeline.
 *
 * Replaces the previous Canvas2D overlay (SkyBodies2.tsx). The full-screen
 * SVG `feTurbulence` dither filter was the dominant cost; per-fragment hash
 * dither inside each shader is essentially free.
 */

import * as THREE from 'three';
import {
  julianDate,
  raDecToAltAz,
  sunRaDec,
  moonRaDec,
} from '../../../lib/skyMath';
import { altAzToXyz } from './starsData';
import { projectWorldToScreen, type ProjModeNum } from './projection';

const DEG = Math.PI / 180;
const SUN_GLOW_FADE_END_DEG = -20;
const MOON_HIDE_BELOW_DEG = 0;

export interface Sky2BodiesDeps {
  scene: THREE.Scene;
  getViewport: () => { width: number; height: number };
  getView: () => {
    yaw: number;
    pitch: number;
    fovDeg: number;
    projMode: ProjModeNum;
  };
  getLstLat: () => { lstRad: number; latRad: number };
  getDate: () => Date;
}

export interface Sky2Bodies {
  setVisible: (which: 'sun' | 'moon', visible: boolean) => void;
  update: () => void;
  dispose: () => void;
}

const VERTEX_SHADER = /* glsl */ `
precision highp float;
attribute vec2 aQuad;
uniform vec2 uCenterNDC;
uniform vec2 uRadiusNDC;
varying vec2 vUv;
void main() {
  vUv = aQuad;
  vec2 p = uCenterNDC + aQuad * uRadiusNDC;
  gl_Position = vec4(p, 0.0, 1.0);
}
`;

const DITHER_FUNC = /* glsl */ `
float ditherTerm() {
  return (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
}
`;

const SUN_OUTER_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uGlowAlpha;
${DITHER_FUNC}
void main() {
  float d = length(vUv);
  if (d > 1.0) discard;
  vec3 cA = vec3(1.000, 0.902, 0.706);
  vec3 cB = vec3(1.000, 0.863, 0.627);
  vec3 cC = vec3(1.000, 0.784, 0.549);
  vec3 cD = vec3(1.000, 0.706, 0.431);
  vec3 cE = vec3(0.902, 0.549, 0.314);
  float aA = 0.65, aB = 0.50, aC = 0.32, aD = 0.16, aE = 0.06;
  vec3 c; float a;
  if (d < 0.08)      { float t = d / 0.08;            c = mix(cA, cB, t); a = mix(aA, aB, t); }
  else if (d < 0.22) { float t = (d - 0.08) / 0.14;   c = mix(cB, cC, t); a = mix(aB, aC, t); }
  else if (d < 0.45) { float t = (d - 0.22) / 0.23;   c = mix(cC, cD, t); a = mix(aC, aD, t); }
  else if (d < 0.75) { float t = (d - 0.45) / 0.30;   c = mix(cD, cE, t); a = mix(aD, aE, t); }
  else               { float t = (d - 0.75) / 0.25;   c = cE;             a = mix(aE, 0.0, t); }
  gl_FragColor = vec4(c + vec3(ditherTerm()), a * uGlowAlpha);
}
`;

const SUN_INNER_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uHorizonT;
${DITHER_FUNC}
void main() {
  float d = length(vUv);
  if (d > 1.0) discard;
  vec3 coreA = vec3(1.000, 0.945, 0.784);
  vec3 coreB = vec3(1.000, 0.820, 0.580);
  vec3 midA  = vec3(1.000, 0.753, 0.467);
  vec3 midB  = vec3(0.949, 0.627, 0.353);
  float warm = step(0.5, uHorizonT);
  vec3 core  = mix(coreA, coreB, warm);
  vec3 mid   = mix(midA,  midB,  warm);
  vec3 outer = vec3(1.000, 0.706, 0.392);
  vec3 c; float a;
  if (d < 0.35) {
    float t = d / 0.35;
    c = mix(core, mid, t);
    a = mix(1.0, 0.8, t);
  } else {
    float t = (d - 0.35) / 0.65;
    c = mix(mid, outer, t);
    a = mix(0.8, 0.0, t);
  }
  gl_FragColor = vec4(c + vec3(ditherTerm()), a);
}
`;

const SUN_DISC_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
${DITHER_FUNC}
void main() {
  float d = length(vUv);
  if (d > 1.0) discard;
  vec3 c0 = vec3(1.000, 0.988, 0.937);
  vec3 c1 = vec3(1.000, 0.914, 0.690);
  vec3 c2 = vec3(1.000, 0.824, 0.549);
  vec3 c; float a;
  if (d < 0.7) {
    float t = d / 0.7;
    c = mix(c0, c1, t);
    a = 1.0;
  } else {
    float t = (d - 0.7) / 0.3;
    c = mix(c1, c2, t);
    a = 1.0 - t;
  }
  float edge = smoothstep(1.0, 0.97, d);
  gl_FragColor = vec4(c + vec3(ditherTerm()), a * edge);
}
`;

const MOON_GLOW_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
${DITHER_FUNC}
void main() {
  float d = length(vUv);
  if (d > 1.0) discard;
  vec3 cA = vec3(0.863, 0.894, 0.961);
  vec3 cB = vec3(0.824, 0.863, 0.941);
  vec3 cC = vec3(0.706, 0.784, 0.894);
  vec3 cD = vec3(0.627, 0.706, 0.843);
  float aA = 0.28, aB = 0.20, aC = 0.10, aD = 0.03;
  vec3 c; float a;
  if (d < 0.15)      { float t = d / 0.15;          c = mix(cA, cB, t); a = mix(aA, aB, t); }
  else if (d < 0.45) { float t = (d - 0.15) / 0.30; c = mix(cB, cC, t); a = mix(aB, aC, t); }
  else if (d < 0.80) { float t = (d - 0.45) / 0.35; c = mix(cC, cD, t); a = mix(aC, aD, t); }
  else               { float t = (d - 0.80) / 0.20; c = cD;             a = mix(aD, 0.0, t); }
  gl_FragColor = vec4(c + vec3(ditherTerm()), a);
}
`;

const MOON_DISC_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uPhase;
${DITHER_FUNC}
void main() {
  float r2 = dot(vUv, vUv);
  if (r2 > 1.0) discard;
  float r = sqrt(r2);

  // Terminator: lit side is right when 0 < uPhase < 0.5 (waxing), left when
  // 0.5 < uPhase < 1 (waning). Matches moonLitPath in skyMath.moon.ts.
  // c is symmetric across 0.5 (+1 at new, -1 at full, 0 at both quarters);
  // side picks which half of the disc the lit region occupies.
  float side = uPhase < 0.5 ? 1.0 : -1.0;
  float c = cos(uPhase * 2.0 * 3.14159265);
  float yC = sqrt(max(0.0, 1.0 - vUv.y * vUv.y));
  bool lit = (side * vUv.x) > (c * yC);

  vec3 outColor = vec3(0.157, 0.180, 0.235);
  if (lit) {
    vec2 lightCtr = vec2(-0.25, 0.20);
    float dLight = length(vUv - lightCtr) / 1.4;
    vec3 lit0 = vec3(0.984, 0.984, 0.992);
    vec3 lit1 = vec3(0.894, 0.910, 0.949);
    vec3 lit2 = vec3(0.722, 0.749, 0.816);
    outColor = dLight < 0.55
      ? mix(lit0, lit1, dLight / 0.55)
      : mix(lit1, lit2, clamp((dLight - 0.55) / 0.45, 0.0, 1.0));
  }

  float edgeAlpha = smoothstep(1.0, 0.97, r);
  float rim = smoothstep(0.94, 1.0, r) * (1.0 - smoothstep(1.0, 1.005, r)) * 0.12;
  gl_FragColor = vec4(outColor + vec3(rim) + vec3(ditherTerm()), 0.92 * edgeAlpha);
}
`;

interface Layer {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  uCenter: THREE.Vector2;
  uRadius: THREE.Vector2;
}

function makeLayer(
  geometry: THREE.BufferGeometry,
  fragmentShader: string,
  extraUniforms: Record<string, THREE.IUniform>,
  renderOrder: number,
  blending: THREE.Blending,
): Layer {
  const uCenter = new THREE.Vector2(0, 0);
  const uRadius = new THREE.Vector2(0, 0);
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader,
    uniforms: {
      uCenterNDC: { value: uCenter },
      uRadiusNDC: { value: uRadius },
      ...extraUniforms,
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = renderOrder;
  mesh.visible = false;
  return { mesh, material, uCenter, uRadius };
}

function placeLayer(
  layer: Layer,
  centerNdcX: number,
  centerNdcY: number,
  radiusPx: number,
  w: number,
  h: number,
): void {
  layer.uCenter.set(centerNdcX, centerNdcY);
  layer.uRadius.set(radiusPx / (w * 0.5), radiusPx / (h * 0.5));
  layer.mesh.visible = true;
}

export function createSkyBodies(deps: Sky2BodiesDeps): Sky2Bodies {
  let sunVisible = false;
  let moonVisible = false;

  // All five layers share one BufferGeometry — the quad is identical (4 verts,
  // 6 indices). Disposed once at the end.
  const quad = new THREE.BufferGeometry();
  quad.setAttribute('aQuad', new THREE.BufferAttribute(
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), 2,
  ));
  quad.setIndex([0, 1, 2, 2, 1, 3]);

  // Outer halo + moon glow are additive (light adding to the dark sky).
  // Inner halo and the discs use normal alpha blending so they paint over
  // whatever's underneath — matches the original Canvas2D pipeline, where
  // the disc's crisp limb depended on the inner alpha replacing the outer
  // halo color rather than summing with it.
  const sunOuter = makeLayer(quad, SUN_OUTER_FRAG, { uGlowAlpha: { value: 0 } }, 20, THREE.AdditiveBlending);
  const sunInner = makeLayer(quad, SUN_INNER_FRAG, { uHorizonT:  { value: 0 } }, 21, THREE.NormalBlending);
  const sunDisc  = makeLayer(quad, SUN_DISC_FRAG,  {},                           22, THREE.NormalBlending);
  const moonGlow = makeLayer(quad, MOON_GLOW_FRAG, {},                           23, THREE.AdditiveBlending);
  const moonDisc = makeLayer(quad, MOON_DISC_FRAG, { uPhase:     { value: 0 } }, 24, THREE.NormalBlending);
  const layers = [sunOuter, sunInner, sunDisc, moonGlow, moonDisc];
  for (const layer of layers) deps.scene.add(layer.mesh);

  function setVisible(which: 'sun' | 'moon', visible: boolean): void {
    if (which === 'sun') sunVisible = visible;
    else moonVisible = visible;
  }

  function hideSun(): void {
    sunOuter.mesh.visible = false;
    sunInner.mesh.visible = false;
    sunDisc.mesh.visible = false;
  }

  function hideMoon(): void {
    moonGlow.mesh.visible = false;
    moonDisc.mesh.visible = false;
  }

  function updateSun(jd: number, lstRad: number, latRad: number, view: ReturnType<Sky2BodiesDeps['getView']>, w: number, h: number, focal: number): void {
    if (!sunVisible) { hideSun(); return; }

    const { raRad, decRad } = sunRaDec(jd);
    const { altRad, azRad } = raDecToAltAz(raRad, decRad, lstRad, latRad);
    const altDeg = altRad / DEG;
    const glowAlpha = altDeg >= 0
      ? 1
      : Math.max(0, 1 - altDeg / SUN_GLOW_FADE_END_DEG);

    const p = projectWorldToScreen(altAzToXyz(altRad, azRad, 1), {
      yaw: view.yaw, pitch: view.pitch, fovDeg: view.fovDeg, projMode: view.projMode,
      viewportW: w, viewportH: h,
    });
    const onscreen = p.visible && Number.isFinite(p.x) && Number.isFinite(p.y);
    if (!onscreen) { hideSun(); return; }

    const cx = (p.x / w) * 2 - 1;
    const cy = 1 - (p.y / h) * 2;

    if (glowAlpha > 0) {
      placeLayer(sunOuter, cx, cy, Math.max(160, focal * 1.6), w, h);
      sunOuter.material.uniforms.uGlowAlpha.value = glowAlpha;
    } else {
      sunOuter.mesh.visible = false;
    }

    if (altDeg >= 0) {
      placeLayer(sunInner, cx, cy, Math.max(14, focal * 0.10), w, h);
      sunInner.material.uniforms.uHorizonT.value =
        Math.max(0, Math.min(1, (10 - altDeg) / 14));
      placeLayer(sunDisc, cx, cy, Math.max(4, focal * 0.022), w, h);
    } else {
      sunInner.mesh.visible = false;
      sunDisc.mesh.visible = false;
    }
  }

  function updateMoon(jd: number, lstRad: number, latRad: number, view: ReturnType<Sky2BodiesDeps['getView']>, w: number, h: number, focal: number): void {
    if (!moonVisible) { hideMoon(); return; }

    const { raRad, decRad, phaseFrac } = moonRaDec(jd);
    const { altRad, azRad } = raDecToAltAz(raRad, decRad, lstRad, latRad);
    const altDeg = altRad / DEG;
    if (altDeg < MOON_HIDE_BELOW_DEG) { hideMoon(); return; }

    const p = projectWorldToScreen(altAzToXyz(altRad, azRad, 1), {
      yaw: view.yaw, pitch: view.pitch, fovDeg: view.fovDeg, projMode: view.projMode,
      viewportW: w, viewportH: h,
    });
    if (!p.visible || !Number.isFinite(p.x) || !Number.isFinite(p.y)) { hideMoon(); return; }

    const cx = (p.x / w) * 2 - 1;
    const cy = 1 - (p.y / h) * 2;

    placeLayer(moonGlow, cx, cy, Math.max(110, focal * 0.95), w, h);
    placeLayer(moonDisc, cx, cy, Math.max(3, focal * 0.018), w, h);
    moonDisc.material.uniforms.uPhase.value = phaseFrac;
  }

  function update(): void {
    const { width: w, height: h } = deps.getViewport();
    const view = deps.getView();
    const focal = (h * 0.5) / Math.tan((view.fovDeg * DEG) / 2);
    if (
      w <= 0 || h <= 0 ||
      !Number.isFinite(view.fovDeg) || view.fovDeg <= 0 ||
      !Number.isFinite(focal) || focal <= 0
    ) {
      hideSun();
      hideMoon();
      return;
    }
    const { lstRad, latRad } = deps.getLstLat();
    const jd = julianDate(deps.getDate());
    updateSun(jd, lstRad, latRad, view, w, h, focal);
    updateMoon(jd, lstRad, latRad, view, w, h, focal);
  }

  function dispose(): void {
    for (const layer of layers) {
      deps.scene.remove(layer.mesh);
      layer.material.dispose();
    }
    quad.dispose();
  }

  return { setVisible, update, dispose };
}
