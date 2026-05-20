export const PROJ_MODE = { rect: 0, fisheye: 1, stereo: 2 } as const;

export type Sky2Projection = keyof typeof PROJ_MODE;

export const PROJ_FOV: Record<Sky2Projection, { min: number; max: number; def: number }> = {
  rect:    { min: 8,  max: 110, def: 60  },
  fisheye: { min: 10, max: 220, def: 160 },
  stereo:  { min: 10, max: 300, def: 130 },
};

export const projGLSL = `
  uniform int uProjMode;
  uniform float uHalfFovY;
  uniform float uAspect;

  vec4 projectPoint(vec3 vp) {
    if (uProjMode == 0) {
      return projectionMatrix * vec4(vp, 1.0);
    }

    float r = length(vp);
    if (r < 1e-4) return vec4(0.0, 0.0, 0.0, 1.0);
    vec3 d = vp / r;
    float fz = -d.z;
    vec2 uv = vec2(0.0);
    float clipW = 1.0;

    if (uProjMode == 1) {
      float theta = acos(clamp(fz, -1.0, 1.0));
      vec2 horiz = vec2(d.x, d.y);
      float hl = length(horiz);
      vec2 dir = hl > 1e-5 ? horiz / hl : vec2(0.0);
      float rp = theta / uHalfFovY;
      uv.x = dir.x * rp / uAspect;
      uv.y = dir.y * rp;
    }
    else {
      float scale = 1.0 / (2.0 * tan(uHalfFovY * 0.5));
      float denom = 1.0 + fz;
      if (denom < 1e-3) clipW = -1.0;
      denom = max(denom, 1e-3);
      uv.x = d.x * 2.0 * scale / denom / uAspect;
      uv.y = d.y * 2.0 * scale / denom;
    }

    return vec4(uv, 0.0, clipW);
  }
`;

export const particleVertexShader = projGLSL + `
  attribute float aMag;
  attribute float aColorIdx;
  attribute float aIndex;
  attribute float aDensity;
  uniform float uPixelRatio;
  uniform float uMaxIndex;
  uniform float uHoverIndex;
  uniform sampler2D uColorRamp;
  uniform float uLst;        // local sidereal time, radians
  uniform float uLat;        // observer latitude, radians
  varying vec3 vColor;
  varying float vSize;
  varying float vBright;
  varying float vHover;
  void main() {
    // Density cull first — cheaper than running the whole alt/az transform on
    // stars that won't be drawn. aDensity is 1.0 (visible) or 0.0 (culled) per
    // the current density mode (full / balanced / performance).
    if (aDensity < 0.5) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // off-clip
      gl_PointSize = 0.0;
      vColor = vec3(0.0);
      vSize = 0.0;
      vBright = 0.0;
      vHover = 0.0;
      return;
    }

    // The position attribute is celestial-cartesian (from raDecToXyz). Recover
    // (ra, dec) by inversion, apply Sky 1's standard RA/Dec → alt/az transform
    // using (uLst, uLat), then re-cartesianify into observer-frame so the rest
    // of the projection pipeline can treat it like any other observer point.
    float r = length(position);
    float dec = asin(position.y / r);
    float ra  = atan(-position.x, -position.z);

    float H      = uLst - ra;
    float sinAlt = sin(dec) * sin(uLat) + cos(dec) * cos(uLat) * cos(H);
    float alt    = asin(clamp(sinAlt, -1.0, 1.0));
    // Sky 1's formula pairs with cartesian (cos(alt)·sin(az), sin(alt),
    // -cos(alt)·cos(az)) to put az=0 at the -Z direction = N.
    float az = atan(-cos(dec) * sin(H), sin(dec) * cos(uLat) - cos(dec) * sin(uLat) * cos(H));

    vec3 obs = vec3(cos(alt) * sin(az), sin(alt), -cos(alt) * cos(az)) * r;
    vec4 mv = modelViewMatrix * vec4(obs, 1.0);
    gl_Position = projectPoint(mv.xyz);

    float visible = step(aIndex + 0.5, uMaxIndex);

    const float MIN_VISIBLE_MAG = -2.0;
    float baseSize = clamp(14.0 - 1.4 * (aMag - MIN_VISIBLE_MAG), 2.0, 14.0);
    float finalSize = baseSize * uPixelRatio * visible;
    gl_PointSize = finalSize;

    float u = clamp((aColorIdx + 0.4) / 2.4, 0.0, 1.0);
    vColor = texture2D(uColorRamp, vec2(u, 0.5)).rgb;

    vSize = finalSize;
    vBright = clamp(1.5 - 0.18 * (aMag - MIN_VISIBLE_MAG), 0.35, 1.5);
    vHover = (uHoverIndex >= 0.0 && abs(aIndex - uHoverIndex) < 0.5) ? 1.0 : 0.0;
  }
`;

export const particleFragmentShader = `
  precision highp float;
  varying vec3 vColor;
  varying float vSize;
  varying float vBright;
  varying float vHover;
  uniform float uBrightness;
  uniform float uHalo;
  uniform float uPixelRatio;
  uniform float uDark;     // 1.0 = dark mode (B-V glow); 0.0 = light mode (dark ink dots)
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv) * 2.0;

    float sizePx = vSize / max(uPixelRatio, 1.0);

    float core = smoothstep(0.55, 0.0, d);
    float halo = exp(-pow(d * 1.8, 2.0));

    float tinyMix = smoothstep(5.0, 2.0, sizePx);
    float blob = exp(-pow(d * 1.6, 2.0));
    core = mix(core, blob, tinyMix);

    float alpha = (core + halo * uHalo * 0.55) * vBright;
    if (alpha < 0.003) discard;

    // Dark mode emits the LUT B-V color × brightness (additive blending stacks
    // these to a glow). Light mode emits a near-black ink so stars read as
    // dots on a light background under NormalBlending.
    vec3 darkCol  = vColor * uBrightness;
    vec3 lightCol = vec3(0.08, 0.10, 0.14);
    vec3 col = mix(lightCol, darkCol, uDark);

    col = mix(col, vec3(1.0, 0.18, 0.20), vHover);
    gl_FragColor = vec4(col, alpha);
  }
`;

export const gridVertexShader = projGLSL + `
  attribute float aFade;
  attribute float aIsFine;
  varying float vFade;
  varying float vDist;
  varying float vIsFine;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDist = length(mv.xyz);
    vFade = aFade;
    vIsFine = aIsFine;
    gl_Position = projectPoint(mv.xyz);
  }
`;

export const gridFragmentShader = `
  precision highp float;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uRadius;
  uniform float uFineOpacity;
  varying float vFade;
  varying float vDist;
  varying float vIsFine;
  void main() {
    float d = clamp(1.2 - vDist / (uRadius * 1.6), 0.2, 1.0);
    // Major lines render at full uOpacity. Fine lines (5° in-between) ramp in
    // via uFineOpacity, which the JS side derives from smoothstep(50, 40, fov).
    float lineAlphaMul = mix(1.0, uFineOpacity, vIsFine);
    float a = uOpacity * vFade * d * lineAlphaMul;
    gl_FragColor = vec4(uColor, a);
  }
`;

// Constellation lines. Stored in celestial-cartesian (raDecToXyz outputs);
// the shader inverts to (ra, dec) then applies the same RA/Dec → alt/az
// transform as the stars shader (using uLst, uLat). `aDash` is 1 on the lit
// half of each subdivided line segment, 0 on the gap — the fragment discards
// the gaps to produce a dashed look.
export const constellationsVertexShader = projGLSL + `
  attribute float aDash;
  uniform float uLst;
  uniform float uLat;
  varying float vDash;
  void main() {
    float r = length(position);
    float dec = asin(position.y / r);
    float ra = atan(-position.x, -position.z);
    float H = uLst - ra;
    float sinAlt = sin(dec) * sin(uLat) + cos(dec) * cos(uLat) * cos(H);
    float alt = asin(clamp(sinAlt, -1.0, 1.0));
    float az = atan(-cos(dec) * sin(H), sin(dec) * cos(uLat) - cos(dec) * sin(uLat) * cos(H));
    vec3 obs = vec3(cos(alt) * sin(az), sin(alt), -cos(alt) * cos(az)) * r;
    vec4 mv = modelViewMatrix * vec4(obs, 1.0);
    gl_Position = projectPoint(mv.xyz);
    vDash = aDash;
  }
`;

export const constellationsFragmentShader = `
  precision highp float;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vDash;
  void main() {
    if (vDash < 0.5) discard;
    gl_FragColor = vec4(uColor, uOpacity);
  }
`;

// Galaxies — Points-based stroked-ellipse renderer. Position is celestial-
// cartesian (same convention as the stars); per-vertex `aMajorRad` /
// `aMinorRad` carry the angular *diameters* of the galaxy's major and minor
// axes in radians, and `aAngleRad` is a per-session random orientation. The
// shader sets `gl_PointSize` to the on-screen diameter of the major axis;
// the fragment shader then draws an outlined ellipse inside the square
// sprite, squashed by `aMinorRad/aMajorRad` and rotated by `aAngleRad`.
//
// `uGalaxyMode`: 0 = visual (clamp to [6, 128] px so tiny entries stay
// visible and giants don't blow past the WebGL point-size cap); 1 = true 1:1
// (no clamp — sub-pixel galaxies render as <1 px and effectively disappear
// at wide FOV, which is the astronomically accurate behaviour).
export const galaxiesVertexShader = projGLSL + `
  attribute float aMajorRad;
  attribute float aMinorRad;
  attribute float aAngleRad;
  uniform float uLst;
  uniform float uLat;
  uniform float uFovDeg;
  uniform float uViewportH;
  uniform float uPixelRatio;
  uniform float uGalaxyMode;
  varying float vSizePx;
  varying float vAxisRatio;
  varying float vAngleRad;
  varying float vMvZ;
  void main() {
    // Invert celestial-cartesian position → (ra, dec), apply the same alt/az
    // transform as the star shader so projection lines up across all layers.
    float r = length(position);
    float dec = asin(position.y / r);
    float ra  = atan(-position.x, -position.z);

    float H      = uLst - ra;
    float sinAlt = sin(dec) * sin(uLat) + cos(dec) * cos(uLat) * cos(H);
    float alt    = asin(clamp(sinAlt, -1.0, 1.0));
    float az     = atan(-cos(dec) * sin(H), sin(dec) * cos(uLat) - cos(dec) * sin(uLat) * cos(H));

    vec3 obs = vec3(cos(alt) * sin(az), sin(alt), -cos(alt) * cos(az)) * r;
    vec4 mv = modelViewMatrix * vec4(obs, 1.0);
    vMvZ = mv.z;
    gl_Position = projectPoint(mv.xyz);

    // Pinhole approximation: pxPerRad = viewportH / radians(fov). Accurate
    // near screen center for rect; close enough for the off-center / fisheye
    // / stereo cases for a debug-cosmetic renderer.
    float pxPerRad = uViewportH / radians(max(uFovDeg, 1.0));
    float majorDiamPx = aMajorRad * pxPerRad;

    // Mode 0 = visual (clamped), Mode 1 = true 1:1 (raw). step(0.5, uMode)
    // is the GLSL idiom for "branch on a bool-shaped float uniform".
    float sizeVisual = clamp(majorDiamPx, 6.0, 128.0);
    float sizeTrue   = majorDiamPx;
    float sizePx = mix(sizeVisual, sizeTrue, step(0.5, uGalaxyMode));

    vSizePx = sizePx;
    // max(0.0, ...) keeps gl_PointSize valid for sub-pixel cases without
    // introducing a visible floor — at <1 px the driver will rasterize a
    // single fragment or nothing, which is the desired "invisible" behaviour.
    gl_PointSize = max(sizePx * uPixelRatio, 0.0);

    // axisRatio is the on-screen squash factor — minor / major in [0, 1].
    // Guarded against zero just in case the catalogue has a degenerate row.
    vAxisRatio = clamp(aMinorRad / max(aMajorRad, 1e-6), 0.05, 1.0);
    vAngleRad = aAngleRad;
  }
`;

// Outlined ellipse. Steps:
//   1) Centre gl_PointCoord into [-1, 1] with +y up (gl_PointCoord origin is
//      top-left in WebGL).
//   2) Rotate by -aAngleRad to align with the ellipse's major axis.
//   3) Compute the "radial scale" d = sqrt(x² + (y/axisRatio)²). The ellipse
//      contour lives at d = 1.
//   4) Convert the stroke pixel width to UV space using vSizePx (the major
//      diameter in screen pixels). Avoids the derivative-extension dance on
//      WebGL 1 / older WKWebView Metal backends.
//   5) Anti-alias by ramping over 1 UV unit on either side of the band.
//
// Output color is uStrokeColor (defaults to #7a1313). Alpha 0 outside the
// stroke band → discarded so the dark sky underneath shows through.
export const galaxiesFragmentShader = `
  precision highp float;
  varying float vSizePx;
  varying float vAxisRatio;
  varying float vAngleRad;
  varying float vMvZ;
  uniform vec3  uStrokeColor;
  uniform float uStrokePx;
  void main() {
    if (vMvZ > -0.01) discard;

    vec2 cp = (gl_PointCoord - 0.5) * 2.0;
    cp.y = -cp.y;

    float c = cos(vAngleRad);
    float s = sin(vAngleRad);
    vec2 rp = vec2(c * cp.x + s * cp.y, -s * cp.x + c * cp.y);

    float d = sqrt(rp.x * rp.x + (rp.y / max(vAxisRatio, 0.05)) * (rp.y / max(vAxisRatio, 0.05)));

    // strokeUV = pixels of stroke / pixels of point radius. Point radius in
    // gl_PointCoord units is 0.5; in centered [-1,1] units it's 1.0. So the
    // pixel-to-UV ratio is (1 unit) / (vSizePx/2 pixels) = 2 / vSizePx.
    float pxToUv = 2.0 / max(vSizePx, 1.0);
    float halfStrokeUV = (uStrokePx * 0.5) * pxToUv;
    float aaUV = pxToUv;

    float alpha = 1.0 - smoothstep(halfStrokeUV, halfStrokeUV + aaUV, abs(d - 1.0));
    if (alpha < 0.01) discard;

    gl_FragColor = vec4(uStrokeColor, alpha);
  }
`;

// Square galaxy variant — used when BLOOM_PIPELINE is ON. Renders the point
// sprite as a solid filled square in uStrokeColor·uBloomBoost. Bloom + ACES
// then paint the halo and roll off the saturated core into a soft glow in
// screen space. vMvZ guard matches the ellipse shader so galaxies behind
// the camera (post alt/az transform) don't draw.
export const galaxiesSquareFragmentShader = `
  precision highp float;
  varying float vMvZ;
  uniform vec3  uStrokeColor;
  uniform float uBloomBoost;
  void main() {
    if (vMvZ > -0.01) discard;
    vec3 col = uStrokeColor * uBloomBoost;
    gl_FragColor = vec4(col, 1.0);
  }
`;

// Vignette — full-screen quad rendered first per frame to subtly lift the
// canvas center relative to the corners. Vertex shader writes literal clip-
// space coords; fragment computes a circular gradient sized by aspect so the
// vignette stays round in landscape windows.
export const vignetteVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.999, 1.0);
  }
`;

export const vignetteFragmentShader = `
  precision highp float;
  varying vec2 vUv;
  uniform vec3 uCenter;
  uniform vec3 uEdge;
  uniform float uAspect;
  uniform float uIntensity;       // 0..1 — mix amount at the brightest center pixel
  void main() {
    vec2 d = (vUv - 0.5) * 2.0;
    d.x *= uAspect;
    float r = length(d);
    // Gaussian-ish soft glow: bright at center, smoothly fading into uEdge (bg).
    float falloff = exp(-pow(r * 1.4, 2.0));
    vec3 col = mix(uEdge, uCenter, falloff * uIntensity);
    gl_FragColor = vec4(col, 1.0);
  }
`;
