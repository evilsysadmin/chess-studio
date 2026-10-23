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

// A lost WebGL context is recoverable on the SAME canvas. The 30 s startup
// fallback may unmount that canvas forever, so never run it while the runtime
// explicitly reports a transient context loss. The painted Home stays usable.
export function home3DContextRecovering(stage) {
  const canvas = stage?.querySelector?.(':scope > canvas.illustrated-home__castle-3d');
  return canvas?.dataset?.homeBlenderRuntime === 'recovering';
}


// A context can transition 'recovering' → 'loading' while the same WebGL Home
// rebuilds resources. The old 30 s watchdog must not unmount it in that gap.
// Once an authentic 3D frame was composed, the painted preview is reversible
// for the remainder of this Home mount (even while its renderer reloads).
export function home3DShouldPreserveCanvas(stage, { everPresented3D = false } = {}) {
  return everPresented3D || home3DContextRecovering(stage);
}
