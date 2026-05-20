import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }     from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass }     from 'three/addons/postprocessing/OutputPass.js';

// Defaults reproduce the reference demo's look. Threshold is lower than the
// demo's 0.85 because Sky Viewer's per-pixel emitted colors rarely exceed
// 0.85 — without lowering it, only the brightest stars would bloom and the
// galaxies (which we explicitly want to bloom) would not.
const BLOOM_STRENGTH  = 0.8;
const BLOOM_RADIUS    = 0.5;
const BLOOM_THRESHOLD = 0.20;

export interface BloomPipeline {
  render(): void;
  setSize(width: number, height: number): void;
  dispose(): void;
  readonly bloomPass: UnrealBloomPass;
}

export interface BloomPipelineOpts {
  renderer: THREE.WebGLRenderer;
  scene:    THREE.Scene;
  camera:   THREE.PerspectiveCamera;
  width:    number;
  height:   number;
}

export function createBloomPipeline(opts: BloomPipelineOpts): BloomPipeline {
  const { renderer, scene, camera, width, height } = opts;

  const composer = new EffectComposer(renderer);
  composer.setSize(width, height);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    BLOOM_STRENGTH,
    BLOOM_RADIUS,
    BLOOM_THRESHOLD,
  );
  composer.addPass(bloomPass);

  // OutputPass handles tone-mapping output transform (ACES, set on the
  // renderer in particleScene.ts) and sRGB encoding. Must be the last pass.
  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  return {
    render: () => composer.render(),
    setSize: (w, h) => composer.setSize(w, h),
    dispose: () => {
      bloomPass.dispose();
      composer.dispose();
    },
    bloomPass,
  };
}
