import { chromium, expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { activateSetupControl, buttonWithVisibleText, login, mockApi } from './helpers.js';
import { navigateWarRoomKeyboard } from './war-room-board-input.js';

// Opt-in local benchmark only. rAF is not GPU time; emulated touch is not a phone GPU.
const requested = process.env.WAR_ROOM_GPU_BENCH_RENDERER;
const revision = process.env.WAR_ROOM_GPU_BENCH_SHA || '';
// One ID per invocation: repeated A/B runs must never overwrite old samples.
const runId = randomUUID();
if (process.env.WAR_ROOM_GPU_BENCH !== '1'
    || !['hardware', 'software'].includes(requested)
    || !/^[0-9a-f]{40}$/i.test(revision)) {
  throw new Error('Set WAR_ROOM_GPU_BENCH=1, WAR_ROOM_GPU_BENCH_RENDERER=hardware|software and WAR_ROOM_GPU_BENCH_SHA=<40-char SHA>');
}

const profiles = [
  { id: 'desktop-1440x900', viewport: { width: 1440, height: 900 }, touch: false },
  { id: 'touch-portrait-390x844', viewport: { width: 390, height: 844 }, touch: true },
  { id: 'touch-landscape-844x390', viewport: { width: 844, height: 390 }, touch: true },
];
const outputDir = resolve(process.cwd(), '../.artifacts/war-room-gpu-benchmark');
const variantKey = 'chess-study-war-room-variant-v1';
const onboarding = {
  'chess-study-mechanic-tutorial-progress-v1': JSON.stringify({ 'war-room-basics': { seen: true } }),
  'matthias.onboarded': '2',
  'chess-study-home-guide-dismissed-v1': '1',
  [variantKey]: 'v3',
  // Opt-in only in this local benchmark. Production/regular E2E stays inert.
  'war-room-gpu-profile': '1',
};
let browser;

function percentile(values, fraction) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)].toFixed(2));
}

async function startProbe(page) {
  await page.evaluate(() => {
    if (window.__warRoomBenchProbe) throw new Error('Frame probe already started');
    const probe = {
      started: performance.now(), intervals: [], longTasks: [],
      longTaskSupported: false, lastFrame: null, raf: null, observer: null,
      gpu: {
        lastCount: null, samplesMs: [], droppedQueries: 0,
        disjointObserved: false, status: 'absent',
      },
    };
    // Sample only actually completed WebGL2 elapsed timer queries published
    // by the War Room canvas. Never infer GPU time from rAF/CPU stats.
    const readGpu = () => {
      const dataset = document.querySelector('canvas.board3d-main-canvas')?.dataset;
      if (!dataset?.warRoomGpuProfileStatus) return;
      const gpu = probe.gpu;
      gpu.status = dataset.warRoomGpuProfileStatus;
      if (gpu.status === 'disjoint') gpu.disjointObserved = true;
      const count = Number(dataset.warRoomGpuProfileSamples);
      if (!Number.isSafeInteger(count) || count < 0) return;
      if (gpu.lastCount === null) {
        gpu.lastCount = count;
        return;
      }
      if (count <= gpu.lastCount) return;
      // A missed query must not be fabricated from the most recent sample.
      if (count > gpu.lastCount + 1) gpu.droppedQueries += count - gpu.lastCount - 1;
      gpu.lastCount = count;
      const elapsed = Number(dataset.warRoomGpuProfileLastMs);
      if (gpu.status === 'ready' && Number.isFinite(elapsed) && elapsed >= 0) {
        if (gpu.samplesMs.length < 500) gpu.samplesMs.push(elapsed);
      }
    };
    readGpu();
    const tick = (stamp) => {
      if (probe.lastFrame !== null && probe.intervals.length < 5000) {
        probe.intervals.push(stamp - probe.lastFrame);
      }
      probe.lastFrame = stamp;
      readGpu();
      probe.raf = requestAnimationFrame(tick);
    };
    probe.raf = requestAnimationFrame(tick);
    try {
      if (PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
        probe.observer = new PerformanceObserver((list) => {
          for (const task of list.getEntries()) {
            if (probe.longTasks.length < 200) probe.longTasks.push(task.duration);
          }
        });
        probe.observer.observe({ type: 'longtask', buffered: false });
        probe.longTaskSupported = true;
      }
    } catch {
      probe.observer?.disconnect();
      probe.observer = null;
    }
    window.__warRoomBenchProbe = probe;
  });
}

async function stopProbe(page) {
  const raw = await page.evaluate(() => {
    const probe = window.__warRoomBenchProbe;
    if (!probe) throw new Error('Frame probe missing');
    cancelAnimationFrame(probe.raf);
    probe.observer?.disconnect();
    delete window.__warRoomBenchProbe;
    return {
      elapsedMs: performance.now() - probe.started,
      visibility: document.visibilityState,
      intervals: probe.intervals,
      longTasks: probe.longTasks,
      longTaskSupported: probe.longTaskSupported,
      gpuTimer: {
        status: probe.gpu.status,
        samplesMs: probe.gpu.samplesMs,
        droppedQueries: probe.gpu.droppedQueries,
        disjointObserved: probe.gpu.disjointObserved,
      },
    };
  });
  expect(raw.visibility, 'Foreground session required for rAF pacing').toBe('visible');
  expect(raw.intervals.length, 'No usable frames collected').toBeGreaterThan(10);
  return {
    elapsedMs: Math.round(raw.elapsedMs),
    rafIntervals: raw.intervals.length,
    rafP50Ms: percentile(raw.intervals, 0.5),
    rafP95Ms: percentile(raw.intervals, 0.95),
    rafGapsOver33Ms: raw.intervals.filter((ms) => ms > 33.34).length,
    rafGapsOver50Ms: raw.intervals.filter((ms) => ms > 50).length,
    longTaskSupported: raw.longTaskSupported,
    gpuTimer: raw.gpuTimer,
    longTaskCount: raw.longTaskSupported ? raw.longTasks.length : null,
    longTaskMaxMs: raw.longTaskSupported && raw.longTasks.length
      ? Number(Math.max(...raw.longTasks).toFixed(2)) : null,
  };
}

async function sampleIdle(page) {
  await startProbe(page);
  let result;
  try {
    await page.waitForTimeout(2500);
  } finally {
    result = await stopProbe(page);
  }
  return result;
}

async function openV3(page, requestLog) {
  await mockApi(page, { requestLog, profileSeed: onboarding });
  await login(page);
  await buttonWithVisibleText(page, 'Partida rápida').click();
  await activateSetupControl(page.getByRole('button', { name: 'Empezar partida', exact: true }));
  const board = page.locator('[data-board3d-war-room="true"]');
  const canvas = page.locator('canvas.board3d-main-canvas');
  await expect(board).toBeVisible({ timeout: 60_000 });
  await expect(canvas).toBeVisible({ timeout: 60_000 });
  await expect(canvas).toHaveAttribute('data-war-room-variant', 'v3', { timeout: 60_000 });
  await expect(canvas).toHaveAttribute('data-war-room-variant-status', 'ready', { timeout: 60_000 });
  await expect(canvas).toHaveAttribute('data-war-room-first-ready-render-calls', /^[1-9][0-9]*$/, { timeout: 30_000 });
  const tutorial = page.locator('[data-war-room-first-run-tutorial="true"]');
  if (await tutorial.isVisible().catch(() => false)) {
    await tutorial.getByRole('button', { name: /Saltar|Continuar/ }).click();
    await expect(tutorial).toBeHidden();
  }
  return { board, canvas };
}

async function inspectActualRenderer(canvas) {
  return canvas.evaluate((element) => {
    // Inspect the REAL Three.js WebGL context, not a synthetic canvas.
    const gl = element.getContext('webgl2') || element.getContext('webgl');
    const extension = gl?.getExtension('WEBGL_debug_renderer_info');
    const raw = extension ? String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) || '') : '';
    const renderer = raw.replace(/[\u0000-\u001f]/g, ' ').slice(0, 160);
    const actual = /swiftshader|llvmpipe|softpipe|lavapipe|software/i.test(renderer)
      ? 'software'
      : /nvidia|geforce|radeon|amd|intel|iris|apple|adreno|mali|powervr|qualcomm/i.test(renderer)
        ? 'hardware' : 'unknown';
    return {
      actual, renderer,
      webgl2: Boolean(gl && typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext),
      canvasPixels: element.width * element.height,
      coarsePointer: matchMedia('(pointer: coarse)').matches,
      firstReady: {
        calls: Number(element.dataset.warRoomFirstReadyRenderCalls || 0),
        triangles: Number(element.dataset.warRoomFirstReadyRenderTriangles || 0),
      },
      snapshotMemory: {
        geometries: Number(element.dataset.board3dMemoryGeometries || 0),
        textures: Number(element.dataset.board3dMemoryTextures || 0),
        programs: Number(element.dataset.board3dMemoryPrograms || 0),
      },
    };
  });
}

async function sampleConfirmedMove(page, board, canvas, requestLog) {
  await navigateWarRoomKeyboard(canvas, board, 'e2');
  await canvas.press('Enter');
  await expect(board).toHaveAttribute('data-board3d-selected', 'e2');
  await navigateWarRoomKeyboard(canvas, board, 'e4');

  await startProbe(page);
  let inputToConfirmationMs;
  let pacing;
  try {
    const startedAt = await page.evaluate(() => performance.now());
    await canvas.press('Enter');
    await expect.poll(
      () => requestLog.some((entry) => entry.method === 'POST' && /\/games\/[^/]+\/move$/.test(entry.path)),
      { timeout: 20_000 },
    ).toBe(true);
    await expect(board).toHaveAttribute('data-board3d-selected', '', { timeout: 20_000 });
    inputToConfirmationMs = Math.round((await page.evaluate(() => performance.now())) - startedAt);
    await page.waitForTimeout(1700);
  } finally {
    pacing = await stopProbe(page);
  }
  return { ...pacing, inputToConfirmationMs };
}

test.beforeAll(async () => {
  browser = await chromium.launch({
    headless: true,
    args: requested === 'hardware'
      ? ['--use-gl=angle', '--use-angle=gl', '--ignore-gpu-blocklist', '--enable-gpu-rasterization']
      : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
});
test.afterAll(async () => { await browser?.close(); });

for (const profile of profiles) {
  test('War Room V3 sustained GPU diagnostic · ' + profile.id, async () => {
    test.setTimeout(240_000);
    const context = await browser.newContext({
      // Manual browser.newContext does not inherit fixture-level baseURL.
      baseURL: test.info().project.use.baseURL || 'http://127.0.0.1:4173/chess-studio/',
      viewport: profile.viewport, hasTouch: profile.touch,
      reducedMotion: 'no-preference', serviceWorkers: 'block',
    });
    await context.addInitScript((seed) => {
      for (const [key, value] of Object.entries(seed)) localStorage.setItem(key, value);
    }, onboarding);
    const visits = [];
    try {
      for (const visitType of ['first-visit', 'return-visit']) {
        const page = await context.newPage();
        const requestLog = [];
        try {
          const startedAt = Date.now();
          const { board, canvas } = await openV3(page, requestLog);
          // Stop the opening clock at readiness, not after idle/move sampling.
          const openToReadyWallMs = Date.now() - startedAt;
          const renderer = await inspectActualRenderer(canvas);
          expect(renderer.actual, 'Real scene renderer must be ' + requested + ': ' + (renderer.renderer || 'unknown')).toBe(requested);
          expect(renderer.coarsePointer).toBe(profile.touch);
          expect(renderer.canvasPixels).toBeGreaterThan(0);
          expect(renderer.firstReady.calls).toBeGreaterThan(0);
          const idle = await sampleIdle(page);
          const move = await sampleConfirmedMove(page, board, canvas, requestLog);
          const gpuTimerQueryMeasured = Boolean(
            idle.gpuTimer.samplesMs.length || move.gpuTimer.samplesMs.length,
          );
          visits.push({
            visitType, openToReadyWallMs,
            ...renderer, idle, move,
            // GPU elapsed is phase-specific: an aggregated frame time would
            // conflate idle and move; retain null rather than manufacture it.
            gpuFrameTimeMs: null, gpuTimerQueryMeasured,
          });
        } finally {
          await page.close();
        }
      }
    } finally {
      await context.close();
    }
    const report = {
      schema: 2, revision, runId, capturedAtUtc: new Date().toISOString(),
      requestedRenderer: requested,
      profile: profile.id, viewport: profile.viewport,
      emulatedTouch: profile.touch, physicalAndroidVerified: false,
      browserFramePacingOnly: !visits.some(({ gpuTimerQueryMeasured }) => gpuTimerQueryMeasured),
      visits,
    };
    await mkdir(outputDir, { recursive: true });
    await writeFile(resolve(outputDir, revision + '-' + requested + '-' + profile.id + '-' + runId + '.json'), JSON.stringify(report, null, 2) + '\n');
    console.log('WAR_ROOM_GPU_BENCH ' + JSON.stringify({
      revision, runId, profile: profile.id, renderer: requested,
      visits: visits.map(({ visitType, idle, move }) => ({
        visitType, idleRafP95Ms: idle.rafP95Ms, moveRafP95Ms: move.rafP95Ms,
        idleGpuQueries: idle.gpuTimer.samplesMs.length,
        moveGpuQueries: move.gpuTimer.samplesMs.length,
        moveConfirmationMs: move.inputToConfirmationMs,
      })),
    }));
  });
}
