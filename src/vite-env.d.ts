/// <reference types="vite/client" />

// GLSL shaders are imported as raw text via Vite's ?raw query suffix:
//   import vert from './foo.vert.glsl?raw';
// Vite handles the asset loading natively — this declaration just gives
// TypeScript the right type for the resulting string module.
declare module '*.glsl?raw' {
  const content: string;
  export default content;
}
