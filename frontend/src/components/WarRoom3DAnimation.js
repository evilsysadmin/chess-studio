export function isSoftwareWebGLRenderer(rendererLabel = '') {
  return /swiftshader|llvmpipe|lavapipe|software rasterizer|software renderer|mesa offscreen/i.test(String(rendererLabel));
}

export function warRoomSceneProfile({ coarsePointer = false, softwareRenderer = false } = {}) {
  const lite = Boolean(coarsePointer || softwareRenderer);
  return Object.freeze({
    tier: lite ? 'lite' : 'full',
    lite,
    pixelRatioCap: softwareRenderer ? 1 : (coarsePointer ? 1.25 : 1.75),
    shadowMapSize: lite ? 512 : 2048,
    shadowsEnabled: !softwareRenderer,
  });
}

export function warRoomAmbientFramePlan({
  documentHidden = false,
  reducedMotion = false,
  coarsePointer = false,
  softwareRenderer = false,
  inspectMode = false,
  elapsedMs = 0,
} = {}) {
  const active = !documentHidden && !reducedMotion && !coarsePointer && !softwareRenderer;
  // The idle heartbeat exists to keep fire/light alive, not to turn the whole
  // castle into a 60 FPS game loop. ~12 FPS looks natural for irregular flame
  // flicker while leaving generous main-thread/GPU headroom for board input.
  // Inspect mode remains responsive at ~60 FPS because camera motion needs it.
  const intervalMs = inspectMode ? 16 : 83;
  const due = active && Number(elapsedMs) >= intervalMs;

  return Object.freeze({
    active,
    intervalMs,
    shouldRender: due,
    updateCamera: due && inspectMode,
  });
}
