import * as THREE from 'three';
import {
  PROJ_MODE,
  PROJ_FOV,
  particleVertexShader,
  particleFragmentShader,
  gridVertexShader,
  gridFragmentShader,
  projGLSL,
  vignetteVertexShader,
  vignetteFragmentShader,
  constellationsVertexShader,
  constellationsFragmentShader,
  galaxiesVertexShader,
  galaxiesFragmentShader,
  galaxiesSquareFragmentShader,
  type Sky2Projection,
} from './shaders';
import type { ProjModeNum } from './projection';
import { shortestYawDelta } from './cameraTween';
import type { Constellation, Galaxy } from '../../../types';
import { AURORA, type Sky2Theme } from './themes';
import { bvToRGB } from '../../../lib/bvToRGB';
import { parsePackedStars, type ParsedStars } from './starsData';
import { createSkyBodies, type Sky2Bodies } from './bodies';
import { createBloomPipeline, type BloomPipeline } from './bloomPipeline';

// ── Dev A/B toggle ─────────────────────────────────────────────────────
// false = current production pipeline (direct render, stroked-ellipse
//         galaxies, no tone mapping).
// true  = EffectComposer with UnrealBloomPass + OutputPass, ACES tone
//         mapping on the renderer, and galaxies rendered as solid filled
//         squares so the bloom pass paints the halo in screen space.
//
// Whole-pipeline toggle: when ON, every layer goes through bloom (stars,
// sun, moon, grid, constellations, ground, vignette, galaxies). Spec:
// docs/superpowers/specs/2026-05-18-bloom-pipeline-toggle-design.md
const BLOOM_PIPELINE = false;

export type Sky2GalaxyMode = 'visual' | 'true';

export type Sky2Density = 'full' | 'balanced' | 'performance';

export interface Sky2Tweaks {
  projection: Sky2Projection;
  galaxyMode: Sky2GalaxyMode;
}

export type Sky2Layer =
  | 'stars'
  | 'grid'
  | 'horizon'
  | 'ground'
  | 'constellations'
  | 'galaxies'
  | 'sun'
  | 'moon';

export interface SceneView {
  yaw: number;
  pitch: number;
  fovDeg: number;
  projMode: ProjModeNum;
}

export interface Sky2Scene {
  setTweak: <K extends keyof Sky2Tweaks>(key: K, value: Sky2Tweaks[K]) => void;
  setTheme: (bg: string, gridColor: string) => void;
  setStars: (buffer: ArrayBuffer, rowCount: number) => void;
  setMode: (dark: boolean) => void;
  setTime: (lstRad: number, latRad: number) => void;
  setDate: (date: Date) => void;
  setLayerVisible: (layer: Sky2Layer, visible: boolean) => void;
  setConstellations: (data: Constellation[]) => void;
  setGalaxies: (data: Galaxy[]) => void;
  setStarDensityMask: (mask: Uint8Array) => void;
  setHoverIndex: (index: number) => void;
  zoomStep: (direction: -1 | 1) => void;
  recenter: () => void;
  centerOnObserverXyz: (x: number, y: number, z: number) => void;
  onFovChange: (cb: (fov: number) => void) => () => void;
  getFov: () => number;
  getView: () => SceneView;
  dispose: () => void;
}

const COLOR_RAMP_SIZE = 256;

// Discrete steps that the +/− zoom buttons walk through. Scroll/pinch stays
// continuous between PROJ_FOV[mode].min and PROJ_FOV[mode].max.
const ZOOM_STEPS = [10, 20, 30, 40, 60, 90, 120, 165, 210, 255, 300] as const;

// Sky bg = the active palette's `--sky-bg` slot. This is a new tier sitting
// between the dark `--surface-2` (~5-9% lightness, reads as black on the
// canvas) and the brighter `--muted` (~35-40% lightness, reads as a UI grey).
// Each palette defines its own `--sky-bg` value channel-wise midway between
// those two slots so the sky bg picks up the palette tint (Ember warm red,
// Aurora cool blue, Verdant green, etc.) at ~20-25% lightness. Falls back
// to `bg` if the var isn't yet resolvable.
function skyBgColor(bg: string): THREE.Color {
  const skyBgVar = typeof document !== 'undefined'
    ? document.documentElement && getComputedStyle(document.documentElement).getPropertyValue('--sky-bg').trim()
    : '';
  if (skyBgVar) {
    try { return new THREE.Color(skyBgVar); } catch { /* fall through */ }
  }
  return new THREE.Color(bg || '#000');
}

// "rgba(r, g, b, a)" → normalized 0..1 channels. r/g/b in palette CSS are
// 0-255 integers, a is 0-1. Returns null if the string isn't an rgb/rgba()
// literal (e.g. a hex string, an empty var, or a malformed value).
function parseRgba(s: string): { r: number; g: number; b: number; a: number } | null {
  const m = s.trim().match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (!m) return null;
  return {
    r: parseFloat(m[1]) / 255,
    g: parseFloat(m[2]) / 255,
    b: parseFloat(m[3]) / 255,
    a: m[4] !== undefined ? parseFloat(m[4]) : 1,
  };
}

// Vignette center color = the palette's `--glow` (an rgba with low alpha)
// composited over the sky bg using standard source-over alpha blending.
// This is the same operation CSS performs when `radial-gradient(...,
// var(--glow), transparent)` is layered over `var(--bg)` on the homepage,
// so the visible glow color on the canvas matches the homepage peak exactly
// (in light mode, where `--sky-bg` equals `--bg`; in dark mode, the source
// glow color is identical, only the bg differs).
function glowCenterColor(skyBg: THREE.Color): THREE.Vector3 {
  if (typeof document === 'undefined') return new THREE.Vector3(skyBg.r, skyBg.g, skyBg.b);
  const glowVar = document.documentElement
    && getComputedStyle(document.documentElement).getPropertyValue('--glow').trim();
  const g = glowVar ? parseRgba(glowVar) : null;
  if (!g) return new THREE.Vector3(skyBg.r, skyBg.g, skyBg.b);
  return new THREE.Vector3(
    g.a * g.r + (1 - g.a) * skyBg.r,
    g.a * g.g + (1 - g.a) * skyBg.g,
    g.a * g.b + (1 - g.a) * skyBg.b,
  );
}

function buildBvColorRamp(): THREE.DataTexture {
  const size = COLOR_RAMP_SIZE;
  const data = new Uint8Array(size * 4);
  for (let i = 0; i < size; i++) {
    const bv = -0.4 + (i / (size - 1)) * 2.4;
    const [r, g, b] = bvToRGB(bv);
    data[i * 4 + 0] = Math.round(r * 255);
    data[i * 4 + 1] = Math.round(g * 255);
    data[i * 4 + 2] = Math.round(b * 255);
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, 1, THREE.RGBAFormat);
  tex.needsUpdate = true;
  return tex;
}

export function mountParticleScene(stage: HTMLElement, initial: Sky2Tweaks): Sky2Scene {
  const theme: Sky2Theme = AURORA;
  const state: Sky2Tweaks = { ...initial };

  const fovListeners = new Set<(fov: number) => void>();
  function emitFov(): void {
    for (const cb of fovListeners) cb(fov);
  }

  let width = stage.clientWidth || window.innerWidth;
  let height = stage.clientHeight || window.innerHeight;

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height);
  // Sky bg = color-mix(in srgb, --surface 70%, --bg 30%) — matches Claude
  // Design's .sky-canvas-wrap so the area outside the glow isn't pure black.
  renderer.setClearColor(skyBgColor(theme.bg), 1);
  stage.appendChild(renderer.domElement);

  if (BLOOM_PIPELINE) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 4000);
  camera.position.set(0, 0, 0);
  camera.rotation.order = 'YXZ';

  const bloomPipeline: BloomPipeline | null = BLOOM_PIPELINE
    ? createBloomPipeline({ renderer, scene, camera, width, height })
    : null;

  const colorRamp = buildBvColorRamp();

  const uniforms = {
    uPixelRatio: { value: renderer.getPixelRatio() },
    uHeight:     { value: height },
    uBrightness: { value: theme.brightness },
    uHalo:       { value: 2.0 },          // glow hardcoded — Tweaks popup removed
    uProjMode:   { value: PROJ_MODE[state.projection] ?? 0 },
    uHalfFovY:   { value: THREE.MathUtils.degToRad(PROJ_FOV[state.projection].def) / 2 },
    uAspect:     { value: width / height },
    uMaxIndex:   { value: 0 },
    uHoverIndex: { value: -1 },
    uColorRamp:  { value: colorRamp },
    uDark:       { value: 1.0 },          // toggled by setMode(); 1 = dark (default)
    uLst:        { value: 0.0 },          // local sidereal time, radians
    uLat:        { value: 0.0 },          // observer latitude, radians
  };

  const particleMaterial = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: particleVertexShader,
    fragmentShader: particleFragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  let pointsStars: THREE.Points | null = null;
  let sphereGrid: THREE.LineSegments | null = null;
  let effectiveCount = 0;

  // ── stars ─────────────────────────────────────────────────────────
  function buildStarsGeometry(parsed: ParsedStars): THREE.BufferGeometry {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position',  new THREE.BufferAttribute(parsed.positions, 3));
    geom.setAttribute('aMag',      new THREE.BufferAttribute(parsed.mag, 1));
    geom.setAttribute('aColorIdx', new THREE.BufferAttribute(parsed.colorIndex, 1));
    geom.setAttribute('aIndex',    new THREE.BufferAttribute(parsed.index, 1));
    // Density mask — populated by setStarDensityMask(); defaults to all-visible.
    const density = new Float32Array(parsed.count);
    density.fill(1.0);
    geom.setAttribute('aDensity', new THREE.BufferAttribute(density, 1));
    return geom;
  }

  function applyStars(parsed: ParsedStars): void {
    if (pointsStars) {
      scene.remove(pointsStars);
      pointsStars.geometry.dispose();
    }
    effectiveCount = parsed.count;
    pointsStars = new THREE.Points(buildStarsGeometry(parsed), particleMaterial);
    pointsStars.frustumCulled = false;
    scene.add(pointsStars);
    // Stale hover would tag a different row in the new geometry — clear it.
    uniforms.uHoverIndex.value = -1;
    // Density UI removed — all loaded stars render.
    uniforms.uMaxIndex.value = effectiveCount;
  }

  function setStarDensityMask(mask: Uint8Array): void {
    if (!pointsStars) return;
    const attr = pointsStars.geometry.getAttribute('aDensity') as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const n = Math.min(arr.length, mask.length);
    for (let i = 0; i < n; i++) arr[i] = mask[i] >= 1 ? 1.0 : 0.0;
    // Fill any tail (shouldn't happen if caller passes a same-length mask).
    for (let i = n; i < arr.length; i++) arr[i] = 1.0;
    attr.needsUpdate = true;
  }

  // ── sphere grid (observer frame: alt rings + az meridians) ─────────
  // Above-horizon only. Alt rings at every 5°; multiples of 10° are major
  // (aIsFine=0), the rest are fine (aIsFine=1, fade in via uFineOpacity at
  // narrow FOV). Az meridians follow the same major/fine split. The horizon
  // line layer covers alt=0 — we skip it here to avoid the visual overlap.
  function buildSphereGrid(radius: number, segs: number): THREE.LineSegments {
    const positions: number[] = [];
    const fades: number[] = [];
    const isFine: number[] = [];

    // Alt rings — alt > 0 only. r = radius·cos(alt), y = radius·sin(alt),
    // ring traced over az ∈ [0, 2π) via (r·sin(az), y, -r·cos(az)).
    for (let altDeg = 5; altDeg <= 85; altDeg += 5) {
      const alt = altDeg * Math.PI / 180;
      const r = radius * Math.cos(alt);
      const y = radius * Math.sin(alt);
      const ringFade = Math.cos(alt);
      const fine = (altDeg % 10 === 0) ? 0 : 1;
      for (let j = 0; j < segs; j++) {
        const a0 = (j / segs) * Math.PI * 2;
        const a1 = ((j + 1) / segs) * Math.PI * 2;
        positions.push(r * Math.sin(a0), y, -r * Math.cos(a0));
        positions.push(r * Math.sin(a1), y, -r * Math.cos(a1));
        fades.push(ringFade, ringFade);
        isFine.push(fine, fine);
      }
    }

    // Az meridians — arc from alt=0 (horizon) to alt=89° (just under zenith).
    for (let azDeg = 0; azDeg < 360; azDeg += 5) {
      const az = azDeg * Math.PI / 180;
      const sx = Math.sin(az);
      const cz = -Math.cos(az);
      const fine = (azDeg % 10 === 0) ? 0 : 1;
      for (let j = 0; j < segs; j++) {
        const a0 = (j / segs) * (89 * Math.PI / 180);
        const a1 = ((j + 1) / segs) * (89 * Math.PI / 180);
        const r0 = radius * Math.cos(a0);
        const y0 = radius * Math.sin(a0);
        const r1 = radius * Math.cos(a1);
        const y1 = radius * Math.sin(a1);
        positions.push(r0 * sx, y0, r0 * cz);
        positions.push(r1 * sx, y1, r1 * cz);
        const f0 = 0.5 + 0.5 * Math.cos(a0);
        const f1 = 0.5 + 0.5 * Math.cos(a1);
        fades.push(f0, f1);
        isFine.push(fine, fine);
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geom.setAttribute('aFade',    new THREE.BufferAttribute(new Float32Array(fades), 1));
    geom.setAttribute('aIsFine',  new THREE.BufferAttribute(new Float32Array(isFine), 1));

    const c = theme.palette[0];
    const gridMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor:       { value: new THREE.Vector3(0.4 + c[0] * 0.6, 0.4 + c[1] * 0.6, 0.4 + c[2] * 0.6) },
        uOpacity:     { value: 0.66 },                // fixed — grid opacity UI removed
        uRadius:      { value: radius },
        uProjMode:    uniforms.uProjMode,
        uHalfFovY:    uniforms.uHalfFovY,
        uAspect:      uniforms.uAspect,
        uFineOpacity: { value: 0.0 },   // driven by setFov ramp below
      },
      vertexShader: gridVertexShader,
      fragmentShader: gridFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    return new THREE.LineSegments(geom, gridMat);
  }

  function rebuildSphereGrid(): void {
    if (sphereGrid) {
      scene.remove(sphereGrid);
      sphereGrid.geometry.dispose();
      (sphereGrid.material as THREE.Material).dispose();
    }
    sphereGrid = buildSphereGrid(420, 192);
    scene.add(sphereGrid);
  }

  // ── horizon line ──────────────────────────────────────────────────
  // Dashed great-circle at Y=0 (the visible horizon). Runs through the
  // projection-aware grid shader so it bends with the active projection
  // rather than appearing as a straight line in screen space.
  let horizonLine: THREE.LineSegments | null = null;

  function buildHorizonLine(radius: number, dashes: number): THREE.LineSegments {
    const positions: number[] = [];
    const fades: number[] = [];
    const stride = 2;
    const totalSlots = dashes * stride;
    for (let slot = 0; slot < totalSlots; slot += stride) {
      const a0 = (slot / totalSlots) * Math.PI * 2;
      const a1 = ((slot + 1) / totalSlots) * Math.PI * 2;
      positions.push(radius * Math.cos(a0), 0, radius * Math.sin(a0));
      positions.push(radius * Math.cos(a1), 0, radius * Math.sin(a1));
      fades.push(1, 1);
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geom.setAttribute('aFade',    new THREE.BufferAttribute(new Float32Array(fades), 1));
    // Horizon lines are always major (aIsFine=0); the shader's mix() collapses
    // to full opacity regardless of uFineOpacity.
    geom.setAttribute('aIsFine',  new THREE.BufferAttribute(new Float32Array(fades.length), 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor:       { value: new THREE.Vector3(0.65, 0.7, 0.75) },
        uOpacity:     { value: 0.85 },
        uRadius:      { value: radius },
        uProjMode:    uniforms.uProjMode,
        uHalfFovY:    uniforms.uHalfFovY,
        uAspect:      uniforms.uAspect,
        uFineOpacity: { value: 1.0 },
      },
      vertexShader: gridVertexShader,
      fragmentShader: gridFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const obj = new THREE.LineSegments(geom, mat);
    obj.renderOrder = 2;
    obj.frustumCulled = false;
    return obj;
  }

  function rebuildHorizonLine(): void {
    if (horizonLine) {
      scene.remove(horizonLine);
      horizonLine.geometry.dispose();
      (horizonLine.material as THREE.Material).dispose();
    }
    horizonLine = buildHorizonLine(420, 192);
    scene.add(horizonLine);
  }

  // ── ground hemisphere ─────────────────────────────────────────────
  // Semi-transparent dome covering Y<0 so the lower hemisphere reads as
  // ground rather than stars-below-the-horizon. Custom shader threads
  // through projGLSL so it warps with the active projection mode. Uses
  // DoubleSide because the camera lives at the origin and would otherwise
  // back-face-cull the inside of the dome (see MEMORY: inside-mesh trap).
  let groundMesh: THREE.Mesh | null = null;

  function buildGroundMesh(radius: number): THREE.Mesh {
    // Fine tessellation keeps individual triangles small in angle space — needed
    // because the projection is non-linear and triangles spanning the projection
    // singularity stretch across the viewport when rasterized.
    const azSteps = 96;
    const altBandsDeg = [0, -5, -10, -15, -22, -30, -40, -52, -65, -78, -90];
    const DEG = Math.PI / 180;

    const positions: number[] = [];
    for (let bi = 0; bi < altBandsDeg.length - 1; bi++) {
      const altA = altBandsDeg[bi] * DEG;
      const altB = altBandsDeg[bi + 1] * DEG;
      const sinA = Math.sin(altA);
      const cosA = Math.cos(altA);
      const sinB = Math.sin(altB);
      const cosB = Math.cos(altB);
      for (let i = 0; i < azSteps; i++) {
        const az0 = (i / azSteps) * Math.PI * 2;
        const az1 = ((i + 1) / azSteps) * Math.PI * 2;
        const p1 = [radius * cosA * Math.sin(az0), radius * sinA, -radius * cosA * Math.cos(az0)];
        const p2 = [radius * cosA * Math.sin(az1), radius * sinA, -radius * cosA * Math.cos(az1)];
        const p3 = [radius * cosB * Math.sin(az1), radius * sinB, -radius * cosB * Math.cos(az1)];
        const p4 = [radius * cosB * Math.sin(az0), radius * sinB, -radius * cosB * Math.cos(az0)];
        positions.push(...p1, ...p2, ...p3);
        positions.push(...p1, ...p3, ...p4);
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));

    const groundVert = `
      ${projGLSL}
      varying float vMvZ;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vMvZ = mv.z;
        gl_Position = projectPoint(mv.xyz);
      }
    `;
    // Discard fragments behind the camera plane. Without this, fisheye/stereo
    // triangles that straddle the projection singularity rasterize across the
    // entire viewport and paint ground color over the sky.
    const groundFrag = `
      precision highp float;
      varying float vMvZ;
      uniform vec3 uColor;
      uniform float uOpacity;
      void main() {
        if (vMvZ > -0.01) discard;
        gl_FragColor = vec4(uColor, uOpacity);
      }
    `;

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor:    { value: new THREE.Vector3(0.04, 0.05, 0.07) },
        uOpacity:  { value: 0.65 },
        uProjMode: uniforms.uProjMode,
        uHalfFovY: uniforms.uHalfFovY,
        uAspect:   uniforms.uAspect,
      },
      vertexShader: groundVert,
      fragmentShader: groundFrag,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geom, mat);
    mesh.renderOrder = 1;
    mesh.frustumCulled = false;
    return mesh;
  }

  function rebuildGroundMesh(): void {
    if (groundMesh) {
      scene.remove(groundMesh);
      groundMesh.geometry.dispose();
      (groundMesh.material as THREE.Material).dispose();
    }
    groundMesh = buildGroundMesh(420);
    scene.add(groundMesh);
  }

  // ── vignette ──────────────────────────────────────────────────────
  // Full-screen quad rendered first per frame. The vertex shader writes
  // literal clip-space coords so the camera + projection pipeline don't apply.
  // Center color is slightly lifted from bg; edges = bg. Refreshed by setTheme.
  let vignetteMesh: THREE.Mesh | null = null;
  // T13/T14 catalogue layers — wired by their tasks. Declared here so the
  // setLayerVisible switch and the public API can reference them.
  let constellationsObj: THREE.LineSegments | null = null;
  let galaxiesObj: THREE.Points | null = null;

  // raDecToXyz inlined (Float32 cheap math; avoids one more import in shaders).
  function _radecCart(raRad: number, decRad: number, r: number): [number, number, number] {
    const cd = Math.cos(decRad);
    return [-r * cd * Math.sin(raRad), r * Math.sin(decRad), -r * cd * Math.cos(raRad)];
  }

  function buildConstellations(data: Constellation[], radius: number, dashesPerLine: number): THREE.LineSegments {
    const positions: number[] = [];
    const dashFlags: number[] = [];
    for (const con of data) {
      // (star.id → ra/dec rads) lookup.
      const idToRaDec = new Map<number, { ra: number; dec: number }>();
      for (const s of con.stars) {
        idToRaDec.set(s.id, { ra: s.ra_h * Math.PI / 12, dec: s.dec_d * Math.PI / 180 });
      }
      for (const [aId, bId] of con.lines) {
        const a = idToRaDec.get(aId);
        const b = idToRaDec.get(bId);
        if (!a || !b) continue;
        const [ax, ay, az] = _radecCart(a.ra, a.dec, radius);
        const [bx, by, bz] = _radecCart(b.ra, b.dec, radius);
        // Subdivide into `dashesPerLine * 2` slots; alternate dash/gap. Each slot
        // emits a 2-vertex segment; the fragment shader discards gap slots.
        const slots = dashesPerLine * 2;
        for (let slot = 0; slot < slots; slot++) {
          const t0 = slot / slots;
          const t1 = (slot + 1) / slots;
          const flag = (slot % 2 === 0) ? 1 : 0;
          const x0 = ax + (bx - ax) * t0;
          const y0 = ay + (by - ay) * t0;
          const z0 = az + (bz - az) * t0;
          const x1 = ax + (bx - ax) * t1;
          const y1 = ay + (by - ay) * t1;
          const z1 = az + (bz - az) * t1;
          // Renormalize to the sphere so interpolated chords don't sag inward
          // significantly under non-linear projections.
          const r0 = radius / Math.sqrt(x0 * x0 + y0 * y0 + z0 * z0);
          const r1 = radius / Math.sqrt(x1 * x1 + y1 * y1 + z1 * z1);
          positions.push(x0 * r0, y0 * r0, z0 * r0);
          positions.push(x1 * r1, y1 * r1, z1 * r1);
          dashFlags.push(flag, flag);
        }
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geom.setAttribute('aDash',    new THREE.BufferAttribute(new Float32Array(dashFlags), 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor:    { value: new THREE.Vector3(0.85, 0.87, 0.95) },     // refreshed by setTheme
        uOpacity:  { value: 0.45 },
        uProjMode: uniforms.uProjMode,
        uHalfFovY: uniforms.uHalfFovY,
        uAspect:   uniforms.uAspect,
        uLst:      uniforms.uLst,
        uLat:      uniforms.uLat,
      },
      vertexShader:   constellationsVertexShader,
      fragmentShader: constellationsFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const obj = new THREE.LineSegments(geom, mat);
    obj.frustumCulled = false;
    obj.renderOrder = 0;
    return obj;
  }

  function setConstellations(data: Constellation[]): void {
    if (constellationsObj) {
      scene.remove(constellationsObj);
      constellationsObj.geometry.dispose();
      (constellationsObj.material as THREE.Material).dispose();
    }
    constellationsObj = buildConstellations(data, 420, 8);
    scene.add(constellationsObj);
  }

  function buildGalaxies(data: Galaxy[]): THREE.Points {
    const DEG = Math.PI / 180;
    const ARCMIN = DEG / 60;
    const DOME_RADIUS = 420;

    const positions = new Float32Array(data.length * 3);
    const majorRads = new Float32Array(data.length);
    const minorRads = new Float32Array(data.length);
    const angleRads = new Float32Array(data.length);

    for (let i = 0; i < data.length; i++) {
      const g = data[i];
      const ra = g.ra_deg * DEG;
      const dec = g.dec_deg * DEG;
      const [x, y, z] = _radecCart(ra, dec, DOME_RADIUS);
      positions[i * 3 + 0] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      majorRads[i] = g.major_arcmin * ARCMIN;
      // PGC entries can have minor > major in pathological rows — guard so
      // the squash factor stays in (0, 1].
      const minor = Math.min(g.minor_arcmin, g.major_arcmin);
      minorRads[i] = minor * ARCMIN;
      // Per-session random orientation. Not persisted — each mount of the
      // scene re-rolls. The catalogue carries a synthetic angle_deg; we
      // ignore it here on purpose.
      angleRads[i] = Math.random() * Math.PI * 2;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position',  new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('aMajorRad', new THREE.BufferAttribute(majorRads, 1));
    geom.setAttribute('aMinorRad', new THREE.BufferAttribute(minorRads, 1));
    geom.setAttribute('aAngleRad', new THREE.BufferAttribute(angleRads, 1));

    const strokeColor = new THREE.Color('#ff1493');

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uProjMode:    uniforms.uProjMode,
        uHalfFovY:    uniforms.uHalfFovY,
        uAspect:      uniforms.uAspect,
        uLst:         uniforms.uLst,
        uLat:         uniforms.uLat,
        uFovDeg:      { value: fov },
        uViewportH:   { value: height },
        uPixelRatio:  { value: renderer.getPixelRatio() },
        uGalaxyMode:  { value: state.galaxyMode === 'true' ? 1.0 : 0.0 },
        uStrokeColor: { value: new THREE.Vector3(strokeColor.r, strokeColor.g, strokeColor.b) },
        // 2.5 CSS px — thick enough to stay legible over the central glow
        // and the lit hemispheres of nebula / aurora palettes.
        uStrokePx:    { value: 2.5 },
        // Bloom-mode emissive multiplier — pushes the stroke color past the
        // 0.20 bloom threshold so ACES can roll it into a soft halo.
        // No-op for the ellipse shader (it doesn't reference this uniform).
        uBloomBoost:  { value: BLOOM_PIPELINE ? 4.0 : 1.0 },
      },
      vertexShader:   galaxiesVertexShader,
      fragmentShader: BLOOM_PIPELINE ? galaxiesSquareFragmentShader : galaxiesFragmentShader,
      transparent: true,
      depthWrite: false,
    });

    const points = new THREE.Points(geom, mat);
    points.frustumCulled = false;
    points.renderOrder = 0;
    return points;
  }

  function setGalaxies(data: Galaxy[]): void {
    if (galaxiesObj) {
      scene.remove(galaxiesObj);
      galaxiesObj.geometry.dispose();
      (galaxiesObj.material as THREE.Material).dispose();
    }
    if (data.length === 0) {
      galaxiesObj = null;
      return;
    }
    galaxiesObj = buildGalaxies(data);
    scene.add(galaxiesObj);
  }

  function buildVignette(): THREE.Mesh {
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array([
      -1, -1, 0,   1, -1, 0,   1, 1, 0,
      -1, -1, 0,   1,  1, 0,  -1, 1, 0,
    ]);
    const uvs = new Float32Array([
      0, 0,  1, 0,  1, 1,
      0, 0,  1, 1,  0, 1,
    ]);
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('uv',       new THREE.BufferAttribute(uvs, 2));

    // Glow = palette `--glow` (rgba) composited over `--sky-bg`, so the
    // peak color matches the homepage's `radial-gradient(..., var(--glow),
    // transparent)` over `var(--bg)`. Edge = `--sky-bg`.
    const skyBg = skyBgColor(theme.bg);
    const center = glowCenterColor(skyBg);

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uCenter:    { value: center },
        uEdge:      { value: new THREE.Vector3(skyBg.r, skyBg.g, skyBg.b) },
        uAspect:    uniforms.uAspect,
        uIntensity: { value: 0.6 },
      },
      vertexShader:   vignetteVertexShader,
      fragmentShader: vignetteFragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.renderOrder = -1;
    mesh.frustumCulled = false;
    return mesh;
  }

  function rebuildVignette(): void {
    if (vignetteMesh) {
      scene.remove(vignetteMesh);
      vignetteMesh.geometry.dispose();
      (vignetteMesh.material as THREE.Material).dispose();
    }
    vignetteMesh = buildVignette();
    scene.add(vignetteMesh);
  }

  // ── camera + input ────────────────────────────────────────────────
  // yaw=0 looks at -Z = az=0 = N once the alt/az pivot lands (Task 5).
  // pitch=+0.3 rad (~17° up) shows more sky than ground at 90° FOV.
  let yaw = 0;
  let pitch = 0.30;
  let yawVel = 0;
  let pitchVel = 0;
  // Double-click-to-center tween. Active while the user is being smoothly
  // moved onto a selected object; cancelled on drag so manual control wins.
  let tweenActive = false;
  let tweenStartMs = 0;
  const TWEEN_DURATION_MS = 700;
  let tweenStartYaw = 0;
  let tweenStartPitch = 0;
  let tweenTargetPitch = 0;
  let tweenYawDelta = 0;
  let fov = Math.max(PROJ_FOV[state.projection].min, Math.min(PROJ_FOV[state.projection].max, 90));

  function fovBounds() {
    return PROJ_FOV[state.projection];
  }

  function setFov(f: number): void {
    const b = fovBounds();
    fov = Math.max(b.min, Math.min(b.max, f));
    camera.fov = Math.min(fov, 170);
    camera.updateProjectionMatrix();
    uniforms.uHalfFovY.value = THREE.MathUtils.degToRad(fov) / 2;
    if (galaxiesObj) {
      const mat = galaxiesObj.material as THREE.ShaderMaterial;
      mat.uniforms.uFovDeg.value = fov;
    }
    // Drive the 5° fine-grid fade. smoothstep(50, 40, fov): off at fov >= 50,
    // on at fov <= 40, smooth in between — matches the threshold the user
    // specified for "show 5° lines when zoomed past 40°".
    if (sphereGrid) {
      const t = Math.max(0, Math.min(1, (50 - fov) / 10));
      const fineOpacity = t * t * (3 - 2 * t);
      const mat = sphereGrid.material as THREE.ShaderMaterial;
      mat.uniforms.uFineOpacity.value = fineOpacity;
    }
    emitFov();
  }
  setFov(fov);

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  const activePointers = new Map<number, { x: number; y: number }>();
  let pinchStartDist = 0;
  let pinchStartFov = fov;

  const onPointerDown = (e: PointerEvent) => {
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.size === 2) {
      const pts = [...activePointers.values()];
      pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchStartFov = fov;
      dragging = false;
      return;
    }

    dragging = true;
    stage.classList.add('dragging');
    lastX = e.clientX;
    lastY = e.clientY;
    try { stage.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    yawVel = 0;
    pitchVel = 0;
    tweenActive = false;
  };

  const onPointerMove = (e: PointerEvent) => {
    if (activePointers.has(e.pointerId)) {
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (activePointers.size === 2) {
      const pts = [...activePointers.values()];
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (pinchStartDist > 0) setFov(pinchStartFov * (pinchStartDist / d));
      return;
    }

    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    const k = (fov / 60) * 0.0028;
    // Drag direction == scene-pan direction (Google-Maps-style "grab the
    // sky"). Drag right → camera turns left → what was off-screen-left
    // slides into view from the right. Same convention vertically.
    yawVel = dx * k;
    pitchVel = dy * k;
    yaw += yawVel;
    pitch += pitchVel;
    pitch = Math.max(-Math.PI / 2 + 0.001, Math.min(Math.PI / 2 - 0.001, pitch));
  };

  const endDrag = (e: PointerEvent) => {
    activePointers.delete(e.pointerId);
    if (activePointers.size < 2) pinchStartDist = 0;
    if (!dragging) return;
    dragging = false;
    stage.classList.remove('dragging');
    try { stage.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    // Any zoom intent is a manual override of an in-flight centering tween.
    tweenActive = false;
    const factor = 1 + (e.deltaY * 0.0014);
    setFov(fov * factor);
  };

  stage.addEventListener('pointerdown', onPointerDown);
  stage.addEventListener('pointermove', onPointerMove);
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  stage.addEventListener('pointerleave', endDrag);
  stage.addEventListener('wheel', onWheel, { passive: false });

  // ── resize ────────────────────────────────────────────────────────
  const resize = () => {
    width = stage.clientWidth || window.innerWidth;
    height = stage.clientHeight || window.innerHeight;
    renderer.setSize(width, height);
    bloomPipeline?.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    uniforms.uHeight.value = height;
    uniforms.uPixelRatio.value = renderer.getPixelRatio();
    uniforms.uAspect.value = width / height;
    if (galaxiesObj) {
      const mat = galaxiesObj.material as THREE.ShaderMaterial;
      mat.uniforms.uViewportH.value = height;
    }
  };
  let resizeObserver: ResizeObserver | null = null;
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(stage);
  } else {
    window.addEventListener('resize', resize);
  }

  // ── sun & moon ────────────────────────────────────────────────────
  let currentDate: Date = new Date();
  function setDate(date: Date): void {
    currentDate = date;
  }
  const bodies: Sky2Bodies = createSkyBodies({
    scene,
    getViewport: () => ({ width, height }),
    getView,
    getLstLat: () => ({
      lstRad: uniforms.uLst.value,
      latRad: uniforms.uLat.value,
    }),
    getDate: () => currentDate,
  });

  // ── animation loop ────────────────────────────────────────────────
  const clock = new THREE.Clock();
  let rafId = 0;
  let disposed = false;

  const animate = () => {
    if (disposed) return;
    clock.getDelta();

    if (tweenActive) {
      const t = Math.min(1, (performance.now() - tweenStartMs) / TWEEN_DURATION_MS);
      // Ease-out cubic — fast start, gentle settle. Feels like the camera is
      // attracted to the target, not driven mechanically.
      const e = 1 - Math.pow(1 - t, 3);
      yaw   = tweenStartYaw   + tweenYawDelta                    * e;
      pitch = tweenStartPitch + (tweenTargetPitch - tweenStartPitch) * e;
      pitch = Math.max(-Math.PI / 2 + 0.001, Math.min(Math.PI / 2 - 0.001, pitch));
      if (t >= 1) tweenActive = false;
    } else if (!dragging) {
      yaw += yawVel;
      pitch += pitchVel;
      yawVel *= 0.94;
      pitchVel *= 0.94;
      pitch = Math.max(-Math.PI / 2 + 0.001, Math.min(Math.PI / 2 - 0.001, pitch));
    }
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;

    bodies.update();

    if (bloomPipeline) {
      bloomPipeline.render();
    } else {
      renderer.render(scene, camera);
    }
    rafId = requestAnimationFrame(animate);
  };

  rebuildVignette();
  rebuildSphereGrid();
  rebuildGroundMesh();
  rebuildHorizonLine();
  // Re-apply the FOV ramp now that sphereGrid exists; the initial setFov(fov)
  // above ran before the grid was built and silently skipped uFineOpacity.
  setFov(fov);
  rafId = requestAnimationFrame(animate);

  // ── public api ────────────────────────────────────────────────────
  function setTweak<K extends keyof Sky2Tweaks>(key: K, value: Sky2Tweaks[K]): void {
    if (key === 'projection') {
      const prev = state.projection;
      const next = value as Sky2Projection;
      state.projection = next;
      uniforms.uProjMode.value = PROJ_MODE[next];
      if (prev !== next) setFov(PROJ_FOV[next].def);
      else setFov(fov);
      return;
    }
    if (key === 'galaxyMode') {
      const next = value as Sky2GalaxyMode;
      state.galaxyMode = next;
      if (galaxiesObj) {
        const mat = galaxiesObj.material as THREE.ShaderMaterial;
        mat.uniforms.uGalaxyMode.value = next === 'true' ? 1.0 : 0.0;
      }
      return;
    }
  }

  function setTheme(bg: string, gridColor: string): void {
    try { renderer.setClearColor(skyBgColor(bg), 1); } catch { /* ignore */ }
    if (sphereGrid) {
      const mat = sphereGrid.material as THREE.ShaderMaterial;
      try {
        // Grid color now comes from --muted (planetarium aesthetic — fades into
        // the bg without competing with stars). Falls back to text-color if
        // --muted isn't defined yet.
        const mutedVar = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim();
        const c = new THREE.Color(mutedVar || gridColor);
        (mat.uniforms.uColor.value as THREE.Vector3).set(c.r, c.g, c.b);
      } catch { /* ignore */ }
    }
    if (groundMesh) {
      const mat = groundMesh.material as THREE.ShaderMaterial;
      try {
        const c = new THREE.Color(bg);
        (mat.uniforms.uColor.value as THREE.Vector3).set(c.r * 0.6, c.g * 0.6, c.b * 0.6);
      } catch { /* ignore */ }
    }
    if (horizonLine) {
      const mat = horizonLine.material as THREE.ShaderMaterial;
      try {
        const c = new THREE.Color(gridColor);
        (mat.uniforms.uColor.value as THREE.Vector3).set(
          Math.min(1, c.r + 0.15),
          Math.min(1, c.g + 0.15),
          Math.min(1, c.b + 0.15),
        );
      } catch { /* ignore */ }
    }
    if (constellationsObj) {
      const mat = constellationsObj.material as THREE.ShaderMaterial;
      try {
        const mutedVar = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim();
        const c = new THREE.Color(mutedVar || gridColor);
        // Constellations slightly brighter than the grid (more visual emphasis).
        (mat.uniforms.uColor.value as THREE.Vector3).set(
          Math.min(1, c.r + 0.1),
          Math.min(1, c.g + 0.1),
          Math.min(1, c.b + 0.1),
        );
      } catch { /* ignore */ }
    }
    if (vignetteMesh) {
      const mat = vignetteMesh.material as THREE.ShaderMaterial;
      try {
        const c = skyBgColor(bg);
        const center = glowCenterColor(c);
        (mat.uniforms.uCenter.value as THREE.Vector3).copy(center);
        (mat.uniforms.uEdge.value as THREE.Vector3).set(c.r, c.g, c.b);
      } catch { /* ignore */ }
    }
  }

  function setStars(buffer: ArrayBuffer, rowCount: number): void {
    const parsed = parsePackedStars(buffer, rowCount);
    applyStars(parsed);
  }

  function setHoverIndex(i: number): void {
    uniforms.uHoverIndex.value = i;
  }

  // Swap blending modes between dark (Additive — stars glow on black) and
  // light (Normal — visible dark ink on a light bg). uDark drives the star
  // fragment shader between the two color paths. Ground stays NormalBlending
  // in both modes (its setTheme tint update keeps it readable).
  function setMode(dark: boolean): void {
    uniforms.uDark.value = dark ? 1.0 : 0.0;
    const blend = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
    particleMaterial.blending = blend;
    particleMaterial.needsUpdate = true;
    if (sphereGrid) {
      const mat = sphereGrid.material as THREE.ShaderMaterial;
      mat.blending = blend;
      mat.needsUpdate = true;
    }
    if (horizonLine) {
      const mat = horizonLine.material as THREE.ShaderMaterial;
      mat.blending = blend;
      mat.needsUpdate = true;
    }
    if (constellationsObj) {
      const mat = constellationsObj.material as THREE.ShaderMaterial;
      mat.blending = blend;
      mat.needsUpdate = true;
    }
  }

  function setTime(lstRad: number, latRad: number): void {
    uniforms.uLst.value = lstRad;
    uniforms.uLat.value = latRad;
  }

  function setLayerVisible(layer: Sky2Layer, v: boolean): void {
    if (layer === 'sun')  { bodies.setVisible('sun', v);  return; }
    if (layer === 'moon') { bodies.setVisible('moon', v); return; }
    if (layer === 'stars'          && pointsStars)        pointsStars.visible = v;
    else if (layer === 'grid'      && sphereGrid)         sphereGrid.visible = v;
    else if (layer === 'horizon'   && horizonLine)        horizonLine.visible = v;
    else if (layer === 'ground'    && groundMesh)         groundMesh.visible = v;
    else if (layer === 'constellations' && constellationsObj) constellationsObj.visible = v;
    else if (layer === 'galaxies'  && galaxiesObj)        galaxiesObj.visible = v;
  }

  function zoomStep(direction: -1 | 1): void {
    // direction = -1: zoom in (narrower FOV, smaller step value).
    // direction = +1: zoom out (wider FOV, larger step value).
    const bounds = PROJ_FOV[state.projection];
    const allowed = ZOOM_STEPS.filter((s) => s >= bounds.min && s <= bounds.max);
    if (allowed.length === 0) { setFov(bounds.def); return; }
    let nearestIdx = 0;
    let nearestErr = Infinity;
    for (let i = 0; i < allowed.length; i++) {
      const e = Math.abs(allowed[i] - fov);
      if (e < nearestErr) { nearestErr = e; nearestIdx = i; }
    }
    const next = Math.max(0, Math.min(allowed.length - 1, nearestIdx + direction));
    setFov(allowed[next]);
  }

  function recenter(): void {
    yaw = 0;
    pitch = 0.30;
    yawVel = 0;
    pitchVel = 0;
    tweenActive = false;
    const b = PROJ_FOV[state.projection];
    setFov(Math.max(b.min, Math.min(b.max, 90)));
  }

  // Smoothly swing the camera so the observer-frame point (x, y, z) lands at
  // screen centre. With Three's YXZ rotation order, the camera's forward
  // direction after applying yaw / pitch is (-sin(yaw)·cos(pitch), sin(pitch),
  // -cos(yaw)·cos(pitch)); equating that to (x, y, z) / r yields the formulae
  // below. Yaw delta is wrapped into [-π, π) so we always take the shortest
  // arc instead of swinging the long way around.
  function centerOnObserverXyz(x: number, y: number, z: number): void {
    const r = Math.sqrt(x * x + y * y + z * z);
    if (r < 1e-6) return;
    const yClamped = Math.max(-1, Math.min(1, y / r));
    const targetPitch = Math.max(
      -Math.PI / 2 + 0.001,
      Math.min(Math.PI / 2 - 0.001, Math.asin(yClamped)),
    );
    const targetYaw = Math.atan2(-x, -z);

    tweenStartYaw = yaw;
    tweenStartPitch = pitch;
    tweenTargetPitch = targetPitch;
    tweenYawDelta = shortestYawDelta(yaw, targetYaw);
    tweenStartMs = performance.now();
    tweenActive = true;
    yawVel = 0;
    pitchVel = 0;
  }

  function onFovChange(cb: (fov: number) => void): () => void {
    fovListeners.add(cb);
    return () => { fovListeners.delete(cb); };
  }

  function getFov(): number {
    return fov;
  }

  function getView(): SceneView {
    return {
      yaw,
      pitch,
      fovDeg: fov,
      projMode: (PROJ_MODE[state.projection] ?? 0) as ProjModeNum,
    };
  }

  function dispose(): void {
    disposed = true;
    cancelAnimationFrame(rafId);
    bloomPipeline?.dispose();

    stage.removeEventListener('pointerdown', onPointerDown);
    stage.removeEventListener('pointermove', onPointerMove);
    stage.removeEventListener('pointerup', endDrag);
    stage.removeEventListener('pointercancel', endDrag);
    stage.removeEventListener('pointerleave', endDrag);
    stage.removeEventListener('wheel', onWheel);

    if (resizeObserver) resizeObserver.disconnect();
    else window.removeEventListener('resize', resize);

    if (pointsStars) {
      scene.remove(pointsStars);
      pointsStars.geometry.dispose();
    }
    if (sphereGrid) {
      scene.remove(sphereGrid);
      sphereGrid.geometry.dispose();
      (sphereGrid.material as THREE.Material).dispose();
    }
    if (horizonLine) {
      scene.remove(horizonLine);
      horizonLine.geometry.dispose();
      (horizonLine.material as THREE.Material).dispose();
    }
    if (groundMesh) {
      scene.remove(groundMesh);
      groundMesh.geometry.dispose();
      (groundMesh.material as THREE.Material).dispose();
    }
    if (vignetteMesh) {
      scene.remove(vignetteMesh);
      vignetteMesh.geometry.dispose();
      (vignetteMesh.material as THREE.Material).dispose();
    }
    if (constellationsObj) {
      scene.remove(constellationsObj);
      constellationsObj.geometry.dispose();
      (constellationsObj.material as THREE.Material).dispose();
    }
    if (galaxiesObj) {
      scene.remove(galaxiesObj);
      galaxiesObj.geometry.dispose();
      (galaxiesObj.material as THREE.Material).dispose();
    }
    bodies.dispose();
    colorRamp.dispose();
    particleMaterial.dispose();
    renderer.dispose();
    if (renderer.domElement.parentNode === stage) {
      stage.removeChild(renderer.domElement);
    }
  }

  return { setTweak, setTheme, setStars, setMode, setTime, setDate, setLayerVisible, setHoverIndex, zoomStep, recenter, centerOnObserverXyz, onFovChange, getFov, getView, setConstellations, setGalaxies, setStarDensityMask, dispose };
}
