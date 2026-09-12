import { threeSurfaceShouldRender } from '../threeRenderPolicy.js';

const WAR_ROOM_RENDER_BUDGETS = Object.freeze({
  desktop: Object.freeze({
    tier: 'full',
    pixelRatioCap: 1.2,
    shadowMapSize: 1024,
    shadowsEnabled: true,
    idleFrameIntervalMs: 100,
    inspectFrameIntervalMs: 16,
  }),
  touch: Object.freeze({
    tier: 'balanced',
    pixelRatioCap: 1.25,
    shadowMapSize: 1024,
    shadowsEnabled: true,
    idleFrameIntervalMs: 150,
    inspectFrameIntervalMs: 33,
  }),
  software: Object.freeze({
    tier: 'lite',
    pixelRatioCap: 1,
    shadowMapSize: 512,
    shadowsEnabled: false,
  }),
});

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

export function warRoomRenderBudget({ coarsePointer = false, softwareRenderer = false } = {}) {
  const interactionBudget = coarsePointer ? WAR_ROOM_RENDER_BUDGETS.touch : WAR_ROOM_RENDER_BUDGETS.desktop;
  const gpuBudget = softwareRenderer ? WAR_ROOM_RENDER_BUDGETS.software : interactionBudget;
  return Object.freeze({
    tier: gpuBudget.tier,
    lite: Boolean(softwareRenderer),
    pixelRatioCap: gpuBudget.pixelRatioCap,
    shadowMapSize: gpuBudget.shadowMapSize,
    shadowsEnabled: gpuBudget.shadowsEnabled,
    idleFrameIntervalMs: interactionBudget.idleFrameIntervalMs,
    inspectFrameIntervalMs: interactionBudget.inspectFrameIntervalMs,
  });
}

export function warRoomSceneProfile(options = {}) {
  // Touch input is not a low-end GPU signal. Modern Android devices keep the
  // full War Room scene graph and save GPU budget through DPR, shadow quality
  // and the lower ambient cadence instead of deleting narrative architecture.
  // Desktop now starts at the real sustainable budget rather than rendering one
  // expensive 1.75 DPR / 2048-shadow frame before the surface pass corrects it.
  const budget = warRoomRenderBudget(options);
  return Object.freeze({
    tier: budget.tier,
    lite: budget.lite,
    pixelRatioCap: budget.pixelRatioCap,
    shadowMapSize: budget.shadowMapSize,
    shadowsEnabled: budget.shadowsEnabled,
  });
}

export function warRoomAmbientFramePlan({
  documentHidden = false,
  reducedMotion = false,
  coarsePointer = false,
  softwareRenderer = false,
  inspectMode = false,
  narrativeActive = false,
  elapsedMs = 0,
} = {}) {
  const active = threeSurfaceShouldRender({
    documentHidden,
    paused: reducedMotion,
  }) && (!softwareRenderer || narrativeActive);
  const budget = warRoomRenderBudget({ coarsePointer, softwareRenderer });
  // The heartbeat exists mainly to keep fire/light alive. Desktop keeps 10 FPS;
  // coarse-pointer/mobile idles at ~6.7 FPS because those slow practical lights
  // do not benefit from 10 FPS, while inspect mode still raises cadence for input.
  const intervalMs = inspectMode
    ? budget.inspectFrameIntervalMs
    : budget.idleFrameIntervalMs;
  const due = active && Number(elapsedMs) >= intervalMs;

  return Object.freeze({
    active,
    intervalMs,
    shouldRender: due,
    updateCamera: due && inspectMode,
  });
}
