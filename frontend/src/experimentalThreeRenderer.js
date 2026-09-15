import { createThreeRenderer } from './threeRenderer.js';

// Experimental 3D scenes deliberately keep premium dynamic shadows, but they do
// not need to rebuild the shadow maps on every animation frame. In software
// WebGL (and on lower-end GPUs) that extra pass can starve UI interaction even
// though the scene itself remains visually fluid. Refreshing the shadow maps a
// few times per second preserves the lighting while keeping the main render loop
// responsive.
export const EXPERIMENTAL_SHADOW_REFRESH_MS = 250;

export function shouldRefreshExperimentalShadows(lastRefreshMs, nowMs, intervalMs = EXPERIMENTAL_SHADOW_REFRESH_MS) {
  if (!Number.isFinite(lastRefreshMs)) return true;
  return nowMs - lastRefreshMs >= intervalMs;
}

export function createExperimentalThreeRenderer(parameters = {}) {
  const renderer = createThreeRenderer(parameters);
  const render = renderer.render.bind(renderer);
  let managesShadowUpdates = false;
  let lastShadowRefreshMs = Number.NEGATIVE_INFINITY;

  renderer.render = (scene, camera) => {
    const shadowMap = renderer.shadowMap;
    if (shadowMap?.enabled) {
      const nowMs = globalThis.performance?.now?.() ?? Date.now();
      if (!managesShadowUpdates) {
        shadowMap.autoUpdate = false;
        shadowMap.needsUpdate = true;
        managesShadowUpdates = true;
        lastShadowRefreshMs = nowMs;
      } else if (shouldRefreshExperimentalShadows(lastShadowRefreshMs, nowMs)) {
        shadowMap.needsUpdate = true;
        lastShadowRefreshMs = nowMs;
      }
    }
    return render(scene, camera);
  };

  return renderer;
}
