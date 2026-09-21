import { devices, expect, test } from '@playwright/test';
import { buttonWithVisibleText, login, mockApi } from './helpers.js';
import { warRoomRenderBudget } from '../frontend/src/components/WarRoom3DAnimation.js';

const WAR_ROOM_READY_TIMEOUT = 45_000;
const RENDER_BUDGET = Object.freeze({
  // Raw WebGL calls cover the complete gameplay frame, not just the canonical
  // room/decor census. On CI's software-lite renderer the measured steady
  // baseline on 2026-09-13 is 813 desktop / 839 Pixel 5. Keep only ~7% headroom
  // so scene growth still trips the ratchet; lite primarily saves pixel/shadow
  // work and cadence, so its raw-call count is not expected to match mesh census.
  steadyPeakDrawCalls: Object.freeze({ full: 850, balanced: 850, lite: 900 }),
  peakTriangles: 2_000_000,
  liveTextures: 128,
  // CI baseline on 2026-09-13 is ~3.1k WebGL buffers during War Room startup
  // because Three expands each BufferGeometry into several GPU buffers and also
  // allocates environment/PMREM intermediates. Keep modest headroom as a ratchet.
  liveBuffers: 3_600,
  maxRafP95Ms: 100,
  // Generous first ratchet for a real move-animation sample. This is tightened
  // from observed CI data rather than guessed from a workstation.
  movingTotalDrawCalls: 50_000,
  movingPaintedFrames: 64,
});

async function installGpuProbe(page) {
  await page.addInitScript(() => {
    const state = {
      frameDrawCalls: 0,
      frameTriangles: 0,
      peakDrawCalls: 0,
      peakTriangles: 0,
      paintedFrames: 0,
      totalDrawCalls: 0,
      liveTextures: new Set(),
      liveBuffers: new Set(),
      longTasks: [],
    };

    const finishFrame = () => {
      if (state.frameDrawCalls > 0) {
        state.paintedFrames += 1;
        state.totalDrawCalls += state.frameDrawCalls;
      }
      state.peakDrawCalls = Math.max(state.peakDrawCalls, state.frameDrawCalls);
      state.peakTriangles = Math.max(state.peakTriangles, state.frameTriangles);
      state.frameDrawCalls = 0;
      state.frameTriangles = 0;
    };

    const trianglesFor = (mode, count, instances = 1) => mode === 0x0004
      ? Math.floor(Number(count || 0) / 3) * Math.max(1, Number(instances || 1))
      : 0;

    const patchPrototype = (proto) => {
      if (!proto || proto.__warRoomGpuAuditPatched) return;
      Object.defineProperty(proto, '__warRoomGpuAuditPatched', { value: true });

      const originalClear = proto.clear;
      if (typeof originalClear === 'function' && !originalClear.__warRoomGpuAuditWrapped) {
        const auditedClear = function auditedClear(...args) {
          finishFrame();
          return originalClear.apply(this, args);
        };
        Object.defineProperty(auditedClear, '__warRoomGpuAuditWrapped', { value: true });
        proto.clear = auditedClear;
      }

      for (const method of ['drawArrays', 'drawElements']) {
        const original = proto[method];
        if (typeof original !== 'function' || original.__warRoomGpuAuditWrapped) continue;
        const auditedDraw = function auditedDraw(mode, ...args) {
          state.frameDrawCalls += 1;
          const count = method === 'drawArrays' ? args[1] : args[0];
          state.frameTriangles += trianglesFor(mode, count);
          return original.call(this, mode, ...args);
        };
        Object.defineProperty(auditedDraw, '__warRoomGpuAuditWrapped', { value: true });
        proto[method] = auditedDraw;
      }

      for (const method of ['drawArraysInstanced', 'drawElementsInstanced']) {
        const original = proto[method];
        if (typeof original !== 'function' || original.__warRoomGpuAuditWrapped) continue;
        const auditedInstancedDraw = function auditedInstancedDraw(mode, ...args) {
          state.frameDrawCalls += 1;
          const count = method === 'drawArraysInstanced' ? args[1] : args[0];
          const instances = args[args.length - 1];
          state.frameTriangles += trianglesFor(mode, count, instances);
          return original.call(this, mode, ...args);
        };
        Object.defineProperty(auditedInstancedDraw, '__warRoomGpuAuditWrapped', { value: true });
        proto[method] = auditedInstancedDraw;
      }

      const originalCreateTexture = proto.createTexture;
      if (typeof originalCreateTexture === 'function' && !originalCreateTexture.__warRoomGpuAuditWrapped) {
        const auditedCreateTexture = function auditedCreateTexture(...args) {
          const texture = originalCreateTexture.apply(this, args);
          if (texture) state.liveTextures.add(texture);
          return texture;
        };
        Object.defineProperty(auditedCreateTexture, '__warRoomGpuAuditWrapped', { value: true });
        proto.createTexture = auditedCreateTexture;
      }
      const originalDeleteTexture = proto.deleteTexture;
      if (typeof originalDeleteTexture === 'function' && !originalDeleteTexture.__warRoomGpuAuditWrapped) {
        const auditedDeleteTexture = function auditedDeleteTexture(texture, ...args) {
          state.liveTextures.delete(texture);
          return originalDeleteTexture.call(this, texture, ...args);
        };
        Object.defineProperty(auditedDeleteTexture, '__warRoomGpuAuditWrapped', { value: true });
        proto.deleteTexture = auditedDeleteTexture;
      }

      const originalCreateBuffer = proto.createBuffer;
      if (typeof originalCreateBuffer === 'function' && !originalCreateBuffer.__warRoomGpuAuditWrapped) {
        const auditedCreateBuffer = function auditedCreateBuffer(...args) {
          const buffer = originalCreateBuffer.apply(this, args);
          if (buffer) state.liveBuffers.add(buffer);
          return buffer;
        };
        Object.defineProperty(auditedCreateBuffer, '__warRoomGpuAuditWrapped', { value: true });
        proto.createBuffer = auditedCreateBuffer;
      }
      const originalDeleteBuffer = proto.deleteBuffer;
      if (typeof originalDeleteBuffer === 'function' && !originalDeleteBuffer.__warRoomGpuAuditWrapped) {
        const auditedDeleteBuffer = function auditedDeleteBuffer(buffer, ...args) {
          state.liveBuffers.delete(buffer);
          return originalDeleteBuffer.call(this, buffer, ...args);
        };
        Object.defineProperty(auditedDeleteBuffer, '__warRoomGpuAuditWrapped', { value: true });
        proto.deleteBuffer = auditedDeleteBuffer;
      }
    };

    patchPrototype(window.WebGLRenderingContext?.prototype);
    patchPrototype(window.WebGL2RenderingContext?.prototype);

    if (typeof PerformanceObserver === 'function') {
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) state.longTasks.push(entry.duration);
        });
        observer.observe({ type: 'longtask', buffered: true });
      } catch {
        // Long Task API is optional; GPU counters remain authoritative.
      }
    }

    window.__warRoomGpuAudit = {
      reset() {
        finishFrame();
        state.frameDrawCalls = 0;
        state.frameTriangles = 0;
        state.peakDrawCalls = 0;
        state.peakTriangles = 0;
        state.paintedFrames = 0;
        state.totalDrawCalls = 0;
        state.liveTextures.clear();
        state.liveBuffers.clear();
        state.longTasks.length = 0;
      },
      resetFramePeaks() {
        finishFrame();
        state.frameDrawCalls = 0;
        state.frameTriangles = 0;
        state.peakDrawCalls = 0;
        state.peakTriangles = 0;
        state.paintedFrames = 0;
        state.totalDrawCalls = 0;
        state.longTasks.length = 0;
      },
      snapshot() {
        finishFrame();
        return {
          peakDrawCalls: state.peakDrawCalls,
          peakTriangles: state.peakTriangles,
          paintedFrames: state.paintedFrames,
          totalDrawCalls: state.totalDrawCalls,
          liveTextures: state.liveTextures.size,
          liveBuffers: state.liveBuffers.size,
          longTaskCount: state.longTasks.length,
          maxLongTaskMs: state.longTasks.length ? Math.max(...state.longTasks) : 0,
        };
      },
    };
  });
}

async function sampleRafP95(page, samples = 45) {
  return page.evaluate((count) => new Promise((resolve) => {
    const deltas = [];
    let previous = performance.now();
    const frame = (now) => {
      deltas.push(now - previous);
      previous = now;
      if (deltas.length >= count) {
        const ordered = deltas.slice(1).sort((a, b) => a - b);
        resolve(ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * 0.95))] || 0);
        return;
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }), samples);
}

async function sampleSteadyGpuFrame(page) {
  const steadyViewport = page.viewportSize();
  let metrics = await page.evaluate(() => window.__warRoomGpuAudit.snapshot());

  for (let attempt = 1; attempt <= 3 && metrics.peakDrawCalls === 0; attempt += 1) {
    if (!steadyViewport) break;

    await page.setViewportSize({
      width: Math.max(1, steadyViewport.width - attempt),
      height: steadyViewport.height,
    });

    // Keep the viewport genuinely changed until ResizeObserver has produced a
    // real gameplay frame. Restoring it immediately can be coalesced into a
    // no-op on software Chromium, leaving the audit at zero despite a healthy
    // event-driven renderer.
    await page.waitForFunction(
      () => window.__warRoomGpuAudit.snapshot().peakDrawCalls > 0,
      null,
      { timeout: 1_500 },
    ).catch(() => null);
    metrics = await page.evaluate(() => window.__warRoomGpuAudit.snapshot());
    await page.setViewportSize(steadyViewport);

    if (metrics.peakDrawCalls > 0) return { metrics, attempts: attempt };
  }

  return { metrics, attempts: 3 };
}

async function collectRenderAudit(page, { viewport } = {}) {
  await installGpuProbe(page);
  if (viewport) await page.setViewportSize(viewport);
  await mockApi(page);
  await login(page);
  await page.evaluate(() => window.__warRoomGpuAudit.reset());

  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();

  const canvas = page.locator('.board3d-main-canvas');
  await expect(canvas).toBeVisible({ timeout: WAR_ROOM_READY_TIMEOUT });
  await page.waitForTimeout(1_500);

  // Keep startup resource accounting, but start the frame budget only after the
  // renderer, environment and scene graph are mounted. Otherwise PMREM/setup
  // work gets mislabeled as one gameplay frame and creates a false regression.
  const startupResources = await page.evaluate(() => window.__warRoomGpuAudit.snapshot());
  await page.evaluate(() => window.__warRoomGpuAudit.resetFramePeaks());

  // Idle War Room is intentionally event-driven, so after resetting the probe it
  // may render nothing at all. Hold a tiny real viewport change until
  // ResizeObserver produces one genuine steady-state gameplay frame.
  const steadySample = await sampleSteadyGpuFrame(page);

  const cssAndBacking = await canvas.evaluate((element) => ({
    cssWidth: element.clientWidth,
    cssHeight: element.clientHeight,
    backingWidth: element.width,
    backingHeight: element.height,
    rendererClass: element.dataset.board3dRendererClass || 'UNKNOWN',
    sceneTier: element.dataset.board3dSceneTier || 'unknown',
  }));
  const rafP95Ms = await sampleRafP95(page);
  const effectivePixelRatio = Math.max(
    cssAndBacking.backingWidth / Math.max(1, cssAndBacking.cssWidth),
    cssAndBacking.backingHeight / Math.max(1, cssAndBacking.cssHeight),
  );

  return {
    cssAndBacking,
    startupResources,
    steadyMetrics: steadySample.metrics,
    steadySampleAttempts: steadySample.attempts,
    rafP95Ms,
    effectivePixelRatio,
  };
}


async function sampleMoveAnimationGpu(page) {
  const board3d = page.locator('[data-board3d-war-room="true"]');
  const canvas = page.locator('.board3d-main-canvas');

  await canvas.focus();
  await canvas.press('ArrowUp');
  await expect(board3d).toHaveAttribute('data-board3d-focused', 'e2');
  await canvas.press('Enter');
  await expect(board3d).toHaveAttribute('data-board3d-selected', 'e2');
  await canvas.press('ArrowUp');
  await canvas.press('ArrowUp');
  await expect(board3d).toHaveAttribute('data-board3d-focused', 'e4');

  await page.evaluate(() => window.__warRoomGpuAudit.resetFramePeaks());
  const startedAt = Date.now();
  await canvas.press('Enter');
  await page.waitForTimeout(900);

  const metrics = await page.evaluate(() => window.__warRoomGpuAudit.snapshot());
  const diagnostics = await canvas.evaluate((element) => ({
    adaptiveQuality: element.dataset.board3dAdaptiveQuality || 'unknown',
    animationCadence: element.dataset.board3dAnimationCadence || 'unknown',
  }));

  return {
    ...metrics,
    ...diagnostics,
    sampleMs: Date.now() - startedAt,
  };
}

function logRenderAudit(label, audit, contract) {
  console.log('[war-room-render-budget]', JSON.stringify({
    profile: label,
    rendererClass: audit.cssAndBacking.rendererClass,
    sceneTier: audit.cssAndBacking.sceneTier,
    contractTier: contract.tier,
    effectivePixelRatio: Number(audit.effectivePixelRatio.toFixed(2)),
    pixelRatioCap: contract.pixelRatioCap,
    idleFrameIntervalMs: contract.idleFrameIntervalMs,
    inspectFrameIntervalMs: contract.inspectFrameIntervalMs,
    rafP95Ms: Number(audit.rafP95Ms.toFixed(1)),
    steadyDrawCallCap: RENDER_BUDGET.steadyPeakDrawCalls[audit.cssAndBacking.sceneTier],
    steadySampleAttempts: audit.steadySampleAttempts,
    startupLiveTextures: audit.startupResources.liveTextures,
    startupLiveBuffers: audit.startupResources.liveBuffers,
    steadyPeakDrawCalls: audit.steadyMetrics.peakDrawCalls,
    steadyPeakTriangles: audit.steadyMetrics.peakTriangles,
    steadyLongTaskCount: audit.steadyMetrics.longTaskCount,
    steadyMaxLongTaskMs: audit.steadyMetrics.maxLongTaskMs,
  }));
}

function expectWithinRenderBudget(audit, { coarsePointer = false, label = 'unknown' } = {}) {
  const softwareRenderer = audit.cssAndBacking.sceneTier === 'lite';
  const contract = warRoomRenderBudget({ coarsePointer, softwareRenderer });
  logRenderAudit(label, audit, contract);

  expect(audit.effectivePixelRatio).toBeLessThanOrEqual(contract.pixelRatioCap + 0.05);
  const drawCallCap = RENDER_BUDGET.steadyPeakDrawCalls[audit.cssAndBacking.sceneTier];
  expect(drawCallCap).toBeGreaterThan(0);
  expect(audit.steadyMetrics.peakDrawCalls).toBeGreaterThan(0);
  expect(audit.steadyMetrics.peakDrawCalls).toBeLessThanOrEqual(drawCallCap);
  expect(audit.steadyMetrics.peakTriangles).toBeLessThanOrEqual(RENDER_BUDGET.peakTriangles);
  expect(audit.startupResources.liveTextures).toBeLessThanOrEqual(RENDER_BUDGET.liveTextures);
  expect(audit.startupResources.liveBuffers).toBeLessThanOrEqual(RENDER_BUDGET.liveBuffers);
  expect(audit.rafP95Ms).toBeLessThanOrEqual(RENDER_BUDGET.maxRafP95Ms);

  return contract;
}

test('War Room · presupuesto observable de render evita crecimiento GPU accidental', async ({ page }) => {
  test.setTimeout(120_000);
  const audit = await collectRenderAudit(page, { viewport: { width: 1440, height: 900 } });
  expect(['full', 'lite']).toContain(audit.cssAndBacking.sceneTier);
  expectWithinRenderBudget(audit, { label: 'desktop' });
});

test('War Room · Pixel 5 conserva el tier táctil y el presupuesto GPU', async ({ browser }) => {
  test.setTimeout(120_000);
  const pixel5 = { ...devices['Pixel 5'] };
  delete pixel5.defaultBrowserType;
  const context = await browser.newContext(pixel5);
  const page = await context.newPage();

  try {
    const audit = await collectRenderAudit(page);
    expect(['balanced', 'lite']).toContain(audit.cssAndBacking.sceneTier);
    const contract = expectWithinRenderBudget(audit, { coarsePointer: true, label: 'pixel-5' });
    expect(contract.idleFrameIntervalMs).toBe(150);
    expect(contract.inspectFrameIntervalMs).toBe(24);
  } finally {
    await context.close();
  }
});


test('War Room · una jugada real queda dentro del presupuesto de render sostenido', async ({ page }) => {
  test.setTimeout(120_000);
  await installGpuProbe(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApi(page);
  await login(page);
  await page.evaluate(() => window.__warRoomGpuAudit.reset());

  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();

  const canvas = page.locator('.board3d-main-canvas');
  await expect(canvas).toBeVisible({ timeout: WAR_ROOM_READY_TIMEOUT });
  await page.waitForTimeout(1_500);

  const movement = await sampleMoveAnimationGpu(page);
  console.log('[war-room-motion-budget]', JSON.stringify({
    sampleMs: movement.sampleMs,
    paintedFrames: movement.paintedFrames,
    totalDrawCalls: movement.totalDrawCalls,
    peakDrawCalls: movement.peakDrawCalls,
    peakTriangles: movement.peakTriangles,
    adaptiveQuality: movement.adaptiveQuality,
    animationCadence: movement.animationCadence,
    longTaskCount: movement.longTaskCount,
    maxLongTaskMs: movement.maxLongTaskMs,
  }));

  expect(movement.paintedFrames).toBeGreaterThan(1);
  expect(movement.totalDrawCalls).toBeGreaterThan(movement.peakDrawCalls);
  expect(movement.paintedFrames).toBeLessThanOrEqual(RENDER_BUDGET.movingPaintedFrames);
  expect(movement.totalDrawCalls).toBeLessThanOrEqual(RENDER_BUDGET.movingTotalDrawCalls);
});
