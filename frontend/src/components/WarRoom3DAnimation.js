export function isSoftwareWebGLRenderer(rendererLabel = '') {
  return /swiftshader|llvmpipe|lavapipe|software rasterizer|software renderer|mesa offscreen/i.test(String(rendererLabel));
}

export function warRoomSceneProfile({ coarsePointer = false, softwareRenderer = false } = {}) {
  const lite = Boolean(coarsePointer || softwareRenderer);
  return Object.freeze({
    tier: lite ? 'lite' : 'full',
    lite,
    // Keep the first WebGL frame on the same budget that the premium surface
    // pass applies afterwards. Previously desktop started at 1.75 DPR + a 2048
    // shadow map and only dropped to 1.35/1024 after first paint, so the most
    // expensive frame was precisely the frame the player was waiting for.
    pixelRatioCap: softwareRenderer ? 1 : (coarsePointer ? 1.25 : 1.35),
    shadowMapSize: lite ? 512 : 1024,
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
