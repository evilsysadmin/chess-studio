import { devices, expect, test } from '@playwright/test';
import { buttonWithVisibleText, login, mockApi } from './helpers.js';
import { warRoomRenderBudget } from '../frontend/src/components/WarRoom3DAnimation.js';

const WAR_ROOM_READY_TIMEOUT = 45_000;
const RENDER_BUDGET = Object.freeze({
  peakDrawCalls: 650,
  peakTriangles: 2_000_000,
  liveTextures: 128,
  liveBuffers: 2_048,
  maxRafP95Ms: 100,
});

async function installGpuProbe(page) {
  await page.addInitScript(() => {
    const state = {
      frameDrawCalls: 0,
      frameTriangles: 0,
      peakDrawCalls: 0,
      peakTriangles: 0,
      liveTextures: new Set(),
      liveBuffers: new Set(),
      longTasks: [],
    };

    const finishFrame = () => {
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
        state.liveTextures.clear();
        state.liveBuffers.clear();
        state.longTasks.length = 0;
      },
      snapshot() {
        finishFrame();
        return {
          peakDrawCalls: state.peakDrawCalls,
          peakTriangles: state.peakTriangles,
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

  const cssAndBacking = await canvas.evaluate((element) => ({
    cssWidth: element.clientWidth,
    cssHeight: element.clientHeight,
    backingWidth: element.width,
    backingHeight: element.height,
    rendererClass: element.dataset.board3dRendererClass || 'UNKNOWN',
    sceneTier: element.dataset.board3dSceneTier || 'unknown',
  }));
  const metrics = await page.evaluate(() => window.__warRoomGpuAudit.snapshot());
  const rafP95Ms = await sampleRafP95(page);
  const effectivePixelRatio = Math.max(
    cssAndBacking.backingWidth / Math.max(1, cssAndBacking.cssWidth),
    cssAndBacking.backingHeight / Math.max(1, cssAndBacking.cssHeight),
  );

  return { cssAndBacking, metrics, rafP95Ms, effectivePixelRatio };
}

function expectWithinRenderBudget(audit, { coarsePointer = false } = {}) {
  const softwareRenderer = audit.cssAndBacking.sceneTier === 'lite';
  const contract = warRoomRenderBudget({ coarsePointer, softwareRenderer });

  expect(audit.effectivePixelRatio).toBeLessThanOrEqual(contract.pixelRatioCap + 0.05);
  expect(audit.metrics.peakDrawCalls).toBeGreaterThan(0);
  expect(audit.metrics.peakDrawCalls).toBeLessThanOrEqual(RENDER_BUDGET.peakDrawCalls);
  expect(audit.metrics.peakTriangles).toBeLessThanOrEqual(RENDER_BUDGET.peakTriangles);
  expect(audit.metrics.liveTextures).toBeLessThanOrEqual(RENDER_BUDGET.liveTextures);
  expect(audit.metrics.liveBuffers).toBeLessThanOrEqual(RENDER_BUDGET.liveBuffers);
  expect(audit.rafP95Ms).toBeLessThanOrEqual(RENDER_BUDGET.maxRafP95Ms);

  return contract;
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
    ...audit.metrics,
  }));
}

test('War Room · presupuesto observable de render evita crecimiento GPU accidental', async ({ page }) => {
  test.setTimeout(120_000);
  const audit = await collectRenderAudit(page, { viewport: { width: 1440, height: 900 } });
  expect(['full', 'lite']).toContain(audit.cssAndBacking.sceneTier);
  const contract = expectWithinRenderBudget(audit);
  logRenderAudit('desktop', audit, contract);
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
    const contract = expectWithinRenderBudget(audit, { coarsePointer: true });
    expect(contract.idleFrameIntervalMs).toBe(150);
    expect(contract.inspectFrameIntervalMs).toBe(33);
    logRenderAudit('pixel-5', audit, contract);
  } finally {
    await context.close();
  }
});
