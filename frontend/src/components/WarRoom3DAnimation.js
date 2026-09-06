export function isSoftwareWebGLRenderer(rendererLabel = '') {
  return /swiftshader|llvmpipe|lavapipe|software rasterizer|software renderer|mesa offscreen/i.test(String(rendererLabel));
}

export function compactWebGLRendererLabel(rendererLabel = '') {
  const label = String(rendererLabel);
  if (isSoftwareWebGLRenderer(label)) return 'SOFTWARE';
  if (/nvidia|geforce/i.test(label)) return 'NVIDIA';
  if (/amd|radeon|radv/i.test(label)) return 'AMD';
  if (/intel/i.test(label)) return 'INTEL';
  if (/apple/i.test(label)) return 'APPLE';
  return label.trim() ? 'GPU' : 'UNKNOWN';
}

export function warRoomRendererAttempts() {
  return Object.freeze([
    Object.freeze({
      id: 'gpu-aa',
      liteFallback: false,
      parameters: Object.freeze({
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
        failIfMajorPerformanceCaveat: true,
      }),
    }),
    Object.freeze({
      id: 'gpu-noaa',
      liteFallback: false,
      parameters: Object.freeze({
        antialias: false,
        alpha: false,
        powerPreference: 'high-performance',
        failIfMajorPerformanceCaveat: true,
      }),
    }),
    Object.freeze({
      id: 'fallback-lite',
      liteFallback: true,
      parameters: Object.freeze({
        antialias: false,
        alpha: false,
        powerPreference: 'default',
        failIfMajorPerformanceCaveat: false,
      }),
    }),
  ]);
}

export function warRoomSceneProfile({ coarsePointer = false, softwareRenderer = false } = {}) {
  // Touch input is not a low-end GPU signal. Modern Android devices keep the
  // full War Room scene graph and save GPU budget through DPR, shadow quality
  // and the lower ambient cadence instead of deleting narrative architecture.
  // Desktop now starts at the real sustainable budget rather than rendering one
  // expensive 1.75 DPR / 2048-shadow frame before the surface pass corrects it.
  const lite = Boolean(softwareRenderer);
  const tier = softwareRenderer ? 'lite' : (coarsePointer ? 'balanced' : 'full');
  return Object.freeze({
    tier,
    lite,
    pixelRatioCap: softwareRenderer ? 1 : (coarsePointer ? 1.25 : 1.2),
    shadowMapSize: softwareRenderer ? 512 : (coarsePointer ? 1024 : 1024),
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
  // The heartbeat exists mainly to keep fire/light alive. Ten frames per second
  // is enough for those slow, irregular practicals and trims ~17% of the idle
  // GPU paints versus the historical 12 FPS desktop loop. Inspect mode still
  // raises cadence while the player deliberately moves the camera.
  const intervalMs = inspectMode
    ? (coarsePointer ? 33 : 16)
    : 100;
  const due = active && Number(elapsedMs) >= intervalMs;

  return Object.freeze({
    active,
    intervalMs,
    shouldRender: due,
    updateCamera: due && inspectMode,
  });
}
