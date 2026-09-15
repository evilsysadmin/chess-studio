// Compatibility seam for experimental 3D surfaces. Renderer construction is
// shared with canonical lightweight surfaces so ownership does not proliferate.
export { createThreeRenderer as createExperimentalThreeRenderer } from './threeRenderer.js';
