import { WebGLRenderer as ThreeWebGLRenderer } from 'three';

// Experimental 3D surfaces must not proliferate direct WebGLRenderer ownership.
// Keep construction behind this seam so lifecycle policy can be consolidated
// without every POC growing its own renderer bootstrap contract.
export function createExperimentalThreeRenderer(parameters = {}) {
  return new ThreeWebGLRenderer(parameters);
}
