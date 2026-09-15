import { WebGLRenderer as ThreeWebGLRenderer } from 'three';

// One construction seam for small Three.js surfaces. Keeping renderer ownership
// behind this factory lets the app enforce lifecycle/performance policy without
// every canonical or experimental surface growing another bootstrap site.
export function createThreeRenderer(parameters = {}) {
  return new ThreeWebGLRenderer(parameters);
}
