export const PAWN_SLUG_RENDER_BUDGET = Object.freeze({
  version: 'adaptive-gpu-budget-v3-idle-cadence',
  desktopPixelRatioCap: 1.35,
  balancedPixelRatioCap: 1.15,
  lowPixelRatioCap: 1,
  balancedFrameMs: 23,
  lowFrameMs: 30,
  sampleFrames: 24,
  maxPaintHz: 90,
  idlePaintHz: 24,
  pausedPaintHz: 2,
  diagnosticsSampleMs: 1000,
  localLightRange: 24,
});

const configuredRenderers = new WeakSet();
const adaptiveRendererState = new WeakMap();
const paintLimitedRenderers = new WeakSet();
const lightBudgetedScenes = new WeakSet();

export function pawnSlugCappedPixelRatio(
  currentPixelRatio,
  cap = PAWN_SLUG_RENDER_BUDGET.desktopPixelRatioCap,
) {
  const current = Math.max(0.5, Number(currentPixelRatio) || 1);
  const safeCap = Math.max(1, Number(cap) || PAWN_SLUG_RENDER_BUDGET.desktopPixelRatioCap);
  return Math.min(current, safeCap);
}

export function pawnSlugAdaptiveTierForFrameMs(frameMs) {
  const value = Math.max(0, Number(frameMs) || 0);
  if (value >= PAWN_SLUG_RENDER_BUDGET.lowFrameMs) return 'low';
  if (value >= PAWN_SLUG_RENDER_BUDGET.balancedFrameMs) return 'balanced';
  return 'high';
}

export function pawnSlugPaintHzForState({
  paused = false,
  phase = 'playing',
  maxPaintHz = PAWN_SLUG_RENDER_BUDGET.maxPaintHz,
} = {}) {
  if (paused === true || paused === 'true') return PAWN_SLUG_RENDER_BUDGET.pausedPaintHz;
  if (phase && phase !== 'playing') return PAWN_SLUG_RENDER_BUDGET.idlePaintHz;
  return Math.max(60, Number(maxPaintHz) || PAWN_SLUG_RENDER_BUDGET.maxPaintHz);
}

export function pawnSlugRenderDiagnostics(renderer) {
  const render = renderer?.info?.render || {};
  const memory = renderer?.info?.memory || {};
  return Object.freeze({
    drawCalls: Math.max(0, Number(render.calls) || 0),
    triangles: Math.max(0, Number(render.triangles) || 0),
    points: Math.max(0, Number(render.points) || 0),
    textures: Math.max(0, Number(memory.textures) || 0),
    geometries: Math.max(0, Number(memory.geometries) || 0),
  });
}

function deferAfterRender(task) {
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(task);
    return;
  }
  Promise.resolve().then(task);
}

function rendererDataset(renderer) {
  return renderer?.domElement?.dataset || null;
}

function rendererHostDataset(renderer) {
  return renderer?.domElement?.parentElement?.dataset || null;
}

function writeRenderDiagnostics(renderer) {
  const dataset = rendererDataset(renderer);
  if (!dataset || !renderer?.info) return;
  const metrics = pawnSlugRenderDiagnostics(renderer);
  dataset.pawnSlugDrawCalls = String(metrics.drawCalls);
  dataset.pawnSlugTriangles = String(metrics.triangles);
  dataset.pawnSlugPoints = String(metrics.points);
  dataset.pawnSlugTextures = String(metrics.textures);
  dataset.pawnSlugGeometries = String(metrics.geometries);
}

function schedulePixelRatio(renderer, target) {
  if (!renderer || typeof renderer.setPixelRatio !== 'function') return false;
  const current = Math.max(0.5, Number(renderer.getPixelRatio?.()) || 1);
  if (target >= current - 0.001) return false;
  deferAfterRender(() => {
    if (renderer.domElement?.isConnected === false) return;
    const latest = Math.max(0.5, Number(renderer.getPixelRatio?.()) || current);
    if (latest > target + 0.001) renderer.setPixelRatio(target);
  });
  return true;
}

export function applyPawnSlugRenderBudget(renderer, {
  pixelRatioCap = PAWN_SLUG_RENDER_BUDGET.desktopPixelRatioCap,
} = {}) {
  if (!renderer || configuredRenderers.has(renderer)) {
    return Object.freeze({ configured: false, changed: false, scheduled: false });
  }
  configuredRenderers.add(renderer);

  const current = Math.max(0.5, Number(renderer.getPixelRatio?.()) || 1);
  const target = pawnSlugCappedPixelRatio(current, pixelRatioCap);
  const dataset = rendererDataset(renderer);
  if (dataset) {
    dataset.pawnSlugRenderBudget = `dpr<=${target.toFixed(2)}`;
    dataset.pawnSlugQuality = 'high';
  }

  if (target >= current - 0.001 || typeof renderer.setPixelRatio !== 'function') {
    return Object.freeze({ configured: true, changed: false, scheduled: false, current, target });
  }

  const scheduled = schedulePixelRatio(renderer, target);
  return Object.freeze({ configured: true, changed: scheduled, scheduled, current, target });
}

export function pawnSlugGpuRendererLabel(renderer) {
  try {
    const gl = renderer?.getContext?.();
    if (!gl) return '';
    const debug = gl.getExtension?.('WEBGL_debug_renderer_info');
    const key = debug?.UNMASKED_RENDERER_WEBGL;
    const raw = key != null ? gl.getParameter?.(key) : '';
    return String(raw || '').trim().slice(0, 160);
  } catch {
    return '';
  }
}

function installPawnSlugPaintLimiter(renderer, maxPaintHz = PAWN_SLUG_RENDER_BUDGET.maxPaintHz) {
  if (!renderer || paintLimitedRenderers.has(renderer) || typeof renderer.render !== 'function') return false;
  paintLimitedRenderers.add(renderer);
  const originalRender = renderer.render.bind(renderer);
  let lastPaintAt = Number.NEGATIVE_INFINITY;
  let lastPaintHz = null;
  let lastDiagnosticsAt = Number.NEGATIVE_INFINITY;

  renderer.render = function pawnSlugBudgetedRender(scene, camera) {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const hostDataset = rendererHostDataset(renderer);
    const paintHz = pawnSlugPaintHzForState({
      paused: hostDataset?.pawnSlugPaused,
      phase: hostDataset?.pawnSlugPhase || 'playing',
      maxPaintHz,
    });
    const minimumInterval = 1000 / paintHz;
    if (paintHz !== lastPaintHz) {
      lastPaintHz = paintHz;
      const dataset = rendererDataset(renderer);
      if (dataset) dataset.pawnSlugPaintCap = `${paintHz}hz`;
    }
    if (now - lastPaintAt < minimumInterval) return undefined;
    lastPaintAt = now;
    const result = originalRender(scene, camera);
    if (now - lastDiagnosticsAt >= PAWN_SLUG_RENDER_BUDGET.diagnosticsSampleMs) {
      lastDiagnosticsAt = now;
      writeRenderDiagnostics(renderer);
    }
    return result;
  };
  const dataset = rendererDataset(renderer);
  if (dataset) dataset.pawnSlugPaintCap = `${pawnSlugPaintHzForState({ maxPaintHz })}hz`;
  return true;
}

function worldXOf(node) {
  try {
    node?.updateWorldMatrix?.(true, false);
    const x = node?.matrixWorld?.elements?.[12];
    return Number.isFinite(x) ? x : Number(node?.position?.x) || 0;
  } catch {
    return Number(node?.position?.x) || 0;
  }
}

function installPawnSlugLocalLightBudget(root, scene) {
  if (!root || !scene || lightBudgetedScenes.has(scene)) return false;
  const lights = [];
  root.traverse?.((node) => {
    if (!node?.isPointLight) return;
    lights.push({ light: node, worldX: worldXOf(node) });
  });
  if (!lights.length) return false;

  lightBudgetedScenes.add(scene);
  const previous = scene.onBeforeRender;
  scene.onBeforeRender = function pawnSlugSceneBeforeRender(renderer, currentScene, camera, ...args) {
    previous?.call(this, renderer, currentScene, camera, ...args);
    const cameraX = Number(camera?.position?.x) || 0;
    for (const entry of lights) {
      entry.light.visible = Math.abs(entry.worldX - cameraX) <= PAWN_SLUG_RENDER_BUDGET.localLightRange;
    }
  };
  return true;
}

function applyAdaptiveTier(renderer, tier) {
  const dataset = rendererDataset(renderer);
  if (dataset) dataset.pawnSlugQuality = tier;
  if (tier === 'balanced') {
    schedulePixelRatio(renderer, PAWN_SLUG_RENDER_BUDGET.balancedPixelRatioCap);
    return;
  }
  if (tier !== 'low') return;
  schedulePixelRatio(renderer, PAWN_SLUG_RENDER_BUDGET.lowPixelRatioCap);
  if (renderer.shadowMap?.enabled) {
    deferAfterRender(() => {
      if (renderer.domElement?.isConnected === false) return;
      renderer.shadowMap.enabled = false;
      const latestDataset = rendererDataset(renderer);
      if (latestDataset) latestDataset.pawnSlugShadows = 'adaptive-off';
    });
  }
}

export function observePawnSlugRenderBudget(renderer, now = null) {
  if (!renderer) return Object.freeze({ sampled: false, tier: 'high' });
  const stamp = Number.isFinite(now)
    ? Number(now)
    : (typeof performance !== 'undefined' ? performance.now() : Date.now());
  let state = adaptiveRendererState.get(renderer);
  if (!state) {
    state = { lastAt: stamp, emaMs: 0, samples: 0, tier: 'high' };
    adaptiveRendererState.set(renderer, state);
    const dataset = rendererDataset(renderer);
    const gpu = pawnSlugGpuRendererLabel(renderer);
    if (dataset && gpu) dataset.pawnSlugGpu = gpu;
    return Object.freeze({ sampled: false, tier: state.tier, emaMs: state.emaMs });
  }

  const delta = stamp - state.lastAt;
  state.lastAt = stamp;
  if (!(delta >= 4 && delta <= 180)) {
    state.emaMs = 0;
    state.samples = 0;
    return Object.freeze({ sampled: false, tier: state.tier, emaMs: state.emaMs });
  }

  state.emaMs = state.samples === 0 ? delta : state.emaMs * 0.88 + delta * 0.12;
  state.samples += 1;
  if (state.samples < PAWN_SLUG_RENDER_BUDGET.sampleFrames) {
    return Object.freeze({ sampled: true, changed: false, tier: state.tier, emaMs: state.emaMs });
  }

  const measuredTier = pawnSlugAdaptiveTierForFrameMs(state.emaMs);
  const rank = { high: 0, balanced: 1, low: 2 };
  let changed = false;
  if (rank[measuredTier] > rank[state.tier]) {
    state.tier = measuredTier;
    applyAdaptiveTier(renderer, measuredTier);
    changed = true;
  }
  state.samples = 0;
  return Object.freeze({ sampled: true, changed, tier: state.tier, emaMs: state.emaMs });
}

function firstRenderable(root) {
  if (!root) return null;
  let found = null;
  root.traverse?.((node) => {
    if (!found && (node?.isMesh || node?.isSprite || node?.isPoints)) found = node;
  });
  return found;
}

export function installPawnSlugRenderBudget(root, options = {}) {
  if (!root) return null;
  root.userData ||= {};
  root.userData.pawnSlugRenderBudget = PAWN_SLUG_RENDER_BUDGET.version;

  const proxy = firstRenderable(root);
  if (!proxy) return null;
  const previous = proxy.onBeforeRender;
  let rendererConfigured = false;
  let sceneConfigured = false;
  proxy.onBeforeRender = function pawnSlugRenderBudgetBeforeRender(renderer, scene, camera, ...args) {
    previous?.call(this, renderer, scene, camera, ...args);
    if (!rendererConfigured) {
      rendererConfigured = true;
      applyPawnSlugRenderBudget(renderer, options);
      installPawnSlugPaintLimiter(renderer, options.maxPaintHz);
    }
    if (!sceneConfigured && scene) {
      sceneConfigured = installPawnSlugLocalLightBudget(root, scene) || sceneConfigured;
    }
    observePawnSlugRenderBudget(renderer);
  };
  return proxy;
}