import { threeSurfaceShouldRender } from '../threeRenderPolicy.js';
import { getRenderQualityPreference } from '../userPreferences.js';
import { readWarRoomHardwareHints, resolveWarRoomRenderQuality } from './WarRoomRenderQuality.js';
import { warRoomRenderBudget } from './WarRoomRenderBudget.js';

// Pure budget contract lives in its own module so Playwright specs can import
// it without pulling browser-only modules (import.meta.env) into Node.
export { warRoomRenderBudget };

const WAR_ROOM_QUALITY_BUDGETS = Object.freeze({
  low: Object.freeze({ pixelRatioCap: 0.85, shadowMapSize: 512, shadowRadius: 1.0, shadowsEnabled: false }),
  medium: Object.freeze({ pixelRatioCap: 1.0, shadowMapSize: 512, shadowRadius: 1.1, shadowsEnabled: true }),
  high: Object.freeze({ pixelRatioCap: 1.35, shadowMapSize: 1024, shadowRadius: 1.8, shadowsEnabled: true }),
  ultra: Object.freeze({ pixelRatioCap: 1.75, shadowMapSize: 2048, shadowRadius: 2.35, shadowsEnabled: true }),
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

export function warRoomRendererAttempts({ preserveDrawingBuffer = false } = {}) {
  const captureBuffer = Boolean(preserveDrawingBuffer);
  return Object.freeze([
    Object.freeze({
      id: 'gpu-aa',
      liteFallback: false,
      parameters: Object.freeze({
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
        failIfMajorPerformanceCaveat: true,
        preserveDrawingBuffer: captureBuffer,
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
        preserveDrawingBuffer: captureBuffer,
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
        preserveDrawingBuffer: captureBuffer,
      }),
    }),
  ]);
}

export function warRoomSceneProfile(options = {}) {
  const hardwareHints = options.hardwareHints ?? readWarRoomHardwareHints();
  const requestedQuality = options.renderQuality ?? getRenderQualityPreference();
  const qualityTier = resolveWarRoomRenderQuality({
    ...hardwareHints,
    ...options,
    preference: requestedQuality,
  });
  const qualityBudget = WAR_ROOM_QUALITY_BUDGETS[qualityTier] || WAR_ROOM_QUALITY_BUDGETS.medium;

  // Touch input is not a low-end GPU signal. Modern Android devices keep the
  // full War Room scene graph and save GPU budget through DPR, shadow quality
  // and the lower ambient cadence instead of deleting narrative architecture.
  // Desktop now starts at the real sustainable budget rather than rendering one
  // expensive 1.75 DPR / 2048-shadow frame before the surface pass corrects it.
  const budget = warRoomRenderBudget(options);
  return Object.freeze({
    qualityTier,
    adaptiveQuality: requestedQuality === 'auto',
    tier: budget.tier,
    lite: budget.lite,
    pixelRatioCap: qualityBudget.pixelRatioCap,
    shadowMapSize: qualityBudget.shadowMapSize,
    shadowRadius: qualityBudget.shadowRadius,
    shadowsEnabled: qualityBudget.shadowsEnabled,
  });
}

export function warRoomAmbientFramePlan({
  documentHidden = false,
  intersecting = true,
  reducedMotion = false,
  coarsePointer = false,
  softwareRenderer = false,
  inspectMode = false,
  narrativeActive = false,
  ambientAudit = globalThis.__CHESS_E2E_HANS_AMBIENT_AUDIT__ === true,
  elapsedMs = 0,
} = {}) {
  const active = threeSurfaceShouldRender({
    documentHidden,
    intersecting,
    paused: reducedMotion && !ambientAudit,
  }) && (!softwareRenderer || narrativeActive || ambientAudit);
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
