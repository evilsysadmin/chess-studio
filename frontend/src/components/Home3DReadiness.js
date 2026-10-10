// Both Home renderers set is-ready only after a successful canvas render.
// Do not confuse a mounted canvas, a downloaded GLB or the optional Matthias
// actor with a composed, usable home frame.
export function home3DFrameReady(stage) {
  const canvas = stage?.querySelector?.(':scope > canvas.illustrated-home__castle-3d');
  if (!canvas || !canvas.classList.contains('is-ready')) return false;
  if (canvas.width <= 0 || canvas.height <= 0) return false;
  if (canvas.dataset.homeCastleCompositor === 'blender-runtime') {
    return canvas.dataset.homeBlenderRuntime === 'ready';
  }
  return true; // Legacy renderer has its own texture-composition readiness gate.
}
