export function isSoftwareWebGLRenderer(rendererLabel = '') {
  return /swiftshader|llvmpipe|lavapipe|software rasterizer|software renderer|mesa offscreen/i.test(String(rendererLabel));
}

export function warRoomSceneProfile({ coarsePointer = false, softwareRenderer = false } = {}) {
  // Touch input is not a low-end GPU signal. Modern Android devices keep the
  // full War Room scene graph and save GPU budget through DPR, shadow quality
  // and the lower ambient cadence instead of deleting narrative architecture.
  // Only a confirmed software renderer falls back to the structurally-lite
  // scene used as the emergency compatibility path.
  const lite = Boolean(softwareRenderer);
  const tier = softwareRenderer ? 'lite' : (coarsePointer ? 'balanced' : 'full');
  return Object.freeze({
    tier,
    lite,
    pixelRatioCap: softwareRenderer ? 1 : (coarsePointer ? 1.25 : 1.75),
    shadowMapSize: softwareRenderer ? 512 : (coarsePointer ? 1024 : 2048),
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
  const active = !documentHidden && !reducedMotion && !softwareRenderer;
  // The heartbeat exists mainly to keep fire/light alive. Desktop stays near
  // 12 FPS; coarse-pointer/mobile devices use ~10 FPS, enough for premium flame
  // motion without paying for a full game loop. Inspect mode raises cadence only
  // while the player is actively moving the camera.
  const intervalMs = inspectMode
    ? (coarsePointer ? 33 : 16)
    : (coarsePointer ? 100 : 83);
  const due = active && Number(elapsedMs) >= intervalMs;

  return Object.freeze({
    active,
    intervalMs,
    shouldRender: due,
    updateCamera: due && inspectMode,
  });
}
