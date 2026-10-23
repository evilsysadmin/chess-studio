import { chromium, expect, test } from '@playwright/test';
import { expectedWarRoomGpuShadowWarmup } from './war-room-gpu-shadow-readiness.mjs';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { mockApi, waitForHomeInteractive } from './helpers.js';
import { enterWarRoomGpuQuickMatch } from './war-room-gpu-quick-match.js';
import { navigateWarRoomKeyboard } from './war-room-board-input.js';

// Opt-in local benchmark only. rAF is not GPU time; emulated touch is not a phone GPU.
const requested = process.env.WAR_ROOM_GPU_BENCH_RENDERER;
const revision = process.env.WAR_ROOM_GPU_BENCH_SHA || '';
const variant = process.env.WAR_ROOM_GPU_BENCH_VARIANT || 'v3';
// One ID per invocation: repeated A/B runs must never overwrite old samples.
const runId = randomUUID();
if (process.env.WAR_ROOM_GPU_BENCH !== '1'
    || !['v3', 'v4'].includes(variant)
    || !['hardware', 'software'].includes(requested)
    || !/^[0-9a-f]{40}$/i.test(revision)) {
  throw new Error('Set WAR_ROOM_GPU_BENCH=1, WAR_ROOM_GPU_BENCH_RENDERER=hardware|software and WAR_ROOM_GPU_BENCH_SHA=<40-char SHA> and optionally WAR_ROOM_GPU_BENCH_VARIANT=v3|v4');
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
  [variantKey]: variant,
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
    const journal = document.querySelector('canvas.board3d-main-canvas')?.__warRoomRenderCostJournal;
    const probe = {
      started: performance.now(), intervals: [], longTasks: [],
      longTaskSupported: false, lastFrame: null, raf: null, observer: null,
      renderJournal: journal || null,
      renderStartSeq: journal?.latestSeq ?? null,
      gpu: {
        lastCount: null, samplesMs: [], droppedQueries: 0,
        disjointObserved: false, status: 'absent',
        excludedCrossPhaseQueries: 0, phaseAttributionVerified: true,
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
      if (gpu.status !== 'ready' || !Number.isFinite(elapsed) || elapsed < 0) return;
      const startedRaw = dataset.warRoomGpuProfileLastQueryStartedAtMs;
      const queryStartedAt = Number(startedRaw);
      // Provenance is mandatory: timer completion may be delayed into a
      // different phase. Distinguish *query start* from *result publication*.
      if (startedRaw === undefined || !Number.isFinite(queryStartedAt)
          || queryStartedAt < 0) {
        gpu.phaseAttributionVerified = false;
        return;
      }
      if (queryStartedAt < probe.started) {
        gpu.excludedCrossPhaseQueries += 1;
        return;
      }
      if (gpu.samplesMs.length < 500) gpu.samplesMs.push(elapsed);
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
    const endedAt = performance.now();
    const journal = probe.renderJournal;
    const capture = journal && Number.isSafeInteger(probe.renderStartSeq)
      ? journal.readAfter(probe.renderStartSeq)
      : null;
    // Only renders actually begun AND finished during this phase count.
    // rAF callbacks never stand in for renderer.render submissions.
    const frames = capture?.samples.filter((f) =>
      f.startedAtMs >= probe.started && f.endedAtMs <= endedAt) || [];
    return {
      renderCostRaw: {
        status: !capture ? 'missing' : capture.overflow ? 'overflow'
          : frames.length < 3 ? 'insufficient' : 'ready',
        frames,
      },
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
        excludedCrossPhaseQueries: probe.gpu.excludedCrossPhaseQueries,
        phaseAttributionVerified: probe.gpu.phaseAttributionVerified,
      },
    };
  });
  // This is one real shadow-heavy render snapshot, NOT a phase median nor
  // a GPU time. The full rank can be inspected in the opt-in journal.
  const eligibleCasters = raw.renderCostRaw.status === 'ready'
    ? raw.renderCostRaw.frames.filter((frame) =>
      frame.shadowTopCasters && Number.isSafeInteger(frame.shadowCalls)
      && frame.shadowCalls > 0)
    : [];
  const casterFrame = eligibleCasters.length
    ? eligibleCasters.reduce((best, frame) =>
      frame.shadowCalls > best.shadowCalls ? frame : best)
    : null;
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
    renderCost: {
      status: raw.renderCostRaw.status,
      ...(casterFrame ? { shadowCasterSnapshot: {
        shadowCalls: casterFrame.shadowCalls,
        top: casterFrame.shadowTopCasters.top,
        unrankedCalls: casterFrame.shadowTopCasters.unrankedCalls,
      } } : {}),
      renderedFrames: raw.renderCostRaw.frames.length,
      shadowSplitStatus: raw.renderCostRaw.status !== 'ready' ? 'unavailable'
        : raw.renderCostRaw.frames.every((frame) =>
          Number.isSafeInteger(frame.mainCalls) && Number.isSafeInteger(frame.shadowCalls)
          && Number.isSafeInteger(frame.shadowPasses)
          && frame.mainCalls + frame.shadowCalls === frame.calls)
          ? 'ready' : 'unavailable',
      ...(raw.renderCostRaw.status === 'ready'
        && raw.renderCostRaw.frames.every((frame) =>
          Number.isSafeInteger(frame.mainCalls) && Number.isSafeInteger(frame.shadowCalls)
          && Number.isSafeInteger(frame.shadowPasses)
          && frame.mainCalls + frame.shadowCalls === frame.calls) ? {
        mainCallsMedian: percentile(raw.renderCostRaw.frames.map((f) => f.mainCalls), 0.5),
        shadowCallsMedian: percentile(raw.renderCostRaw.frames.map((f) => f.shadowCalls), 0.5),
        shadowCallsP95: percentile(raw.renderCostRaw.frames.map((f) => f.shadowCalls), 0.95),
        shadowPassesMedian: percentile(raw.renderCostRaw.frames.map((f) => f.shadowPasses), 0.5),
      } : {}),
      shadowFamiliesStatus: raw.renderCostRaw.status === 'ready'
        && raw.renderCostRaw.frames.every((frame) =>
          frame.shadowFamilyCalls
          && ['pieces', 'shell', 'other'].every((key) =>
            Number.isSafeInteger(frame.shadowFamilyCalls[key])
            && frame.shadowFamilyCalls[key] >= 0)
          && frame.shadowFamilyCalls.pieces + frame.shadowFamilyCalls.shell
            + frame.shadowFamilyCalls.other === frame.shadowCalls)
        ? 'ready' : 'unavailable',
      ...(raw.renderCostRaw.status === 'ready'
        && raw.renderCostRaw.frames.every((frame) =>
          frame.shadowFamilyCalls
          && ['pieces', 'shell', 'other'].every((key) =>
            Number.isSafeInteger(frame.shadowFamilyCalls[key])
            && frame.shadowFamilyCalls[key] >= 0)
          && frame.shadowFamilyCalls.pieces + frame.shadowFamilyCalls.shell
            + frame.shadowFamilyCalls.other === frame.shadowCalls) ? {
        shadowPieceCallsMedian: percentile(raw.renderCostRaw.frames.map((f) => f.shadowFamilyCalls.pieces), 0.5),
        shadowShellCallsMedian: percentile(raw.renderCostRaw.frames.map((f) => f.shadowFamilyCalls.shell), 0.5),
        shadowOtherCallsMedian: percentile(raw.renderCostRaw.frames.map((f) => f.shadowFamilyCalls.other), 0.5),
      } : {}),
      ...(raw.renderCostRaw.status === 'ready' ? {
        callsMedian: percentile(raw.renderCostRaw.frames.map((f) => f.calls), 0.5),
        callsP95: percentile(raw.renderCostRaw.frames.map((f) => f.calls), 0.95),
        trianglesMedian: percentile(raw.renderCostRaw.frames.map((f) => f.triangles), 0.5),
        cpuSubmitMedianMs: percentile(raw.renderCostRaw.frames.map((f) => f.cpuSubmitMs), 0.5),
        cpuSubmitP95Ms: percentile(raw.renderCostRaw.frames.map((f) => f.cpuSubmitMs), 0.95),
      } : {}),
    },
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

async function openWarRoom(page, requestLog) {
  await mockApi(page, { requestLog, profileSeed: onboarding });
  // Page navigation uses the existing authenticated E2E session. The test
  // measures the 3D room, not a login form whose 12-second actionability
  // timeout can fail before the first GPU/renderer check even starts.
  const bootErrors = [];
  const onPageError = (error) => {
    if (bootErrors.length < 4) bootErrors.push(String(error?.message || error).slice(0, 200));
  };
  page.on('pageerror', onPageError);
  try {
    const response = await page.goto('./', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('region', { name: 'Modos principales', exact: true }))
      .toBeVisible({ timeout: 45_000 });
    await waitForHomeInteractive(page);
    if (response && !response.ok()) {
      throw new Error('Home document HTTP ' + response.status());
    }
  } catch (error) {
    const snapshot = await page.evaluate(() => ({
      path: location.pathname,
      title: document.title,
      readyState: document.readyState,
      loginPresent: Boolean(document.querySelector('input[type="password"]')),
      bodyText: (document.body?.innerText || '').slice(0, 240),
    })).catch(() => ({ path: 'unavailable', readyState: 'unavailable' }));
    throw new Error('War Room GPU benchmark: authenticated Home did not become interactive; '
      + JSON.stringify({ ...snapshot, pageErrors: bootErrors })
      + '; original: ' + String(error?.message || error).slice(0, 450));
  } finally {
    page.off('pageerror', onPageError);
  }
  // Verify the real modal/CTA before waiting for GPU readiness. The previous
  // benchmark clicked a Home hotspot and silently waited 45 s for a CTA
  // even when no quick-match dialog had opened.
  const { board } = await enterWarRoomGpuQuickMatch(page);
  const canvas = page.locator('canvas.board3d-main-canvas');
  await expect(board).toBeVisible({ timeout: 60_000 });
  await expect(canvas).toBeVisible({ timeout: 60_000 });
  await expect(canvas).toHaveAttribute('data-war-room-variant', variant, { timeout: 60_000 });
  await expect(canvas).toHaveAttribute('data-war-room-variant-status', 'ready', { timeout: 60_000 });
  await expect(canvas).toHaveAttribute('data-war-room-first-ready-render-calls', /^[1-9][0-9]*$/, { timeout: 30_000 });
  // Capture the shell milestone before the lazy actor completes.
  const shellReadyAt = Date.now();
  // Hans is mounted asynchronously after the shell is reported ready.
  // An idle sample must not include that variable installation workload.
  const stageName = variant === 'v3' ? 'v3-armory-hall' : 'v4-tower-study';
  await expect(canvas).toHaveAttribute(
    'data-war-room-hans-stage',
    new RegExp('^' + stageName + ':(quick|idle)$'),
    { timeout: 45_000 },
  );
  const hansStage = await canvas.getAttribute('data-war-room-hans-stage');
  const hansReadyAfterShellMs = Math.max(0, Date.now() - shellReadyAt);
  // Close optional onboarding only AFTER measuring the second milestone:
  // tutorial click/visibility waits must not inflate Hans installation time.
  const tutorial = page.locator('[data-war-room-first-run-tutorial="true"]');
  if (await tutorial.isVisible().catch(() => false)) {
    await tutorial.getByRole('button', { name: /Saltar|Continuar/ }).click();
    await expect(tutorial).toBeHidden();
  }
  return { board, canvas, shellReadyAt, hansStage, hansReadyAfterShellMs };
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
      canvasWidth: element.width,
      canvasHeight: element.height,
      devicePixelRatio: window.devicePixelRatio,
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
      // The runtime already exposes this one-shot GLB/light census. Keep
      // missing telemetry null instead of treating a not-yet-installed room
      // as zero geometry. These are static inventories, NOT rendered draws.
      sceneInventory: {
        ...Object.fromEntries([
          ['shadowCasterCandidates', 'warRoomShadowCasterCandidates'],
          ['v3StaticTorchBatches', 'warRoomV3StaticTorchBatches'],
          ['shadowCasterBudget', 'warRoomShadowCasterBudget'],
          ['activeShadowCasters', 'warRoomShadowCasterCount'],
          ['shadowCandidatePotentialTriangles', 'warRoomShadowCandidatePotentialTriangles'],
          ['shadowSelectedPotentialTriangles', 'warRoomShadowSelectedPotentialTriangles'],
        ].map(([label, key]) => {
          const value = element.dataset[key];
          return [label, value !== undefined && /^[0-9]+$/.test(value)
            ? Number(value) : null];
        })),
        shadowWarmup: element.dataset.warRoomShadowWarmup || null,
      },
    };
  });
}

async function sampleConfirmedMove(page, board, canvas, requestLog) {
  const movePosts = () => requestLog.filter(
    (entry) => entry.method === 'POST' && /\/games\/[^/]+\/move$/.test(entry.path),
  );
  // Benchmark only one reproducible move from a genuinely fresh game.
  // A request left over from setup/recovery would taint the measured phase.
  expect(movePosts(), 'GPU move workload must begin with zero move requests').toHaveLength(0);
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
      () => movePosts().length,
      { message: 'Benchmark move must submit one real /move request', timeout: 20_000 },
    ).toBe(1);
    await expect(board).toHaveAttribute('data-board3d-selected', '', { timeout: 20_000 });
    inputToConfirmationMs = Math.round((await page.evaluate(() => performance.now())) - startedAt);
    await page.waitForTimeout(1700);
    // Polling for *some* POST can hide a double submission. The full
    // measured window must contain exactly one idempotent backend mutation.
    const requests = movePosts();
    expect(requests, 'Duplicated /move invalidates GPU workload').toHaveLength(1);
    expect(requests[0].idempotencyKey, 'Move must have a real idempotency key').toBeTruthy();
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
  test('War Room ' + variant.toUpperCase() + ' sustained GPU diagnostic · ' + profile.id, async () => {
    test.setTimeout(240_000);
    const context = await browser.newContext({
      // Manual browser.newContext does not inherit fixture-level baseURL.
      baseURL: test.info().project.use.baseURL || 'http://127.0.0.1:4173/chess-studio/',
      viewport: profile.viewport, hasTouch: profile.touch,
      reducedMotion: 'no-preference', serviceWorkers: 'block',
    });
    await context.addInitScript((seed) => {
      for (const [key, value] of Object.entries(seed)) localStorage.setItem(key, value);
      // Auth belongs only to localStorage, never to the mocked profile payload.
      // This is the same persisted E2E identity used by the Lab restore test.
      localStorage.setItem('chess-study-auth-token', 'e2e-token');
      localStorage.setItem('chess-study-auth-username', 'e2e');
      // The second visit must also start on Home, not restore an unrelated
      // saved UI route from the first visit in the same browser context.
      sessionStorage.setItem('chess-study-current-view', 'menu');
    }, onboarding);
    const visits = [];
    try {
      for (const visitType of ['first-visit', 'return-visit']) {
        const page = await context.newPage();
        const requestLog = [];
        try {
          const startedAt = Date.now();
          const { board, canvas, shellReadyAt, hansStage, hansReadyAfterShellMs } = await openWarRoom(page, requestLog);
          // Keep the first-ready metric independent of delayed Hans setup.
          const openToReadyWallMs = shellReadyAt - startedAt;
          // Hans' stage being ready does not prove the deferred shadow caster
          // ranking has run. Sampling here once compared a partially warmed
          // room against a fully warmed one, contaminating shadow draw deltas.
          const expectedWarmup = expectedWarRoomGpuShadowWarmup(requested, profile.touch);
          await expect(canvas, 'Shadow setup must be stable before measuring ' + variant
            + ' · ' + profile.id).toHaveAttribute(
            'data-war-room-shadow-warmup', expectedWarmup, { timeout: 20_000 },
          );
          if (expectedWarmup === 'ready-budgeted') {
            await expect.poll(() => canvas.evaluate((element) =>
              Number(element.dataset.warRoomShadowSelectedPotentialTriangles || 0)),
            { message: 'Physical desktop needs nonempty shadow casters', timeout: 20_000 })
              .toBeGreaterThan(0);
          }
          // The inventory is captured only after the shadow warmup gate, so
          // its selected triangle count cannot be a temporary mount-time 0.
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
            visitType, openToReadyWallMs, hansStage, hansReadyAfterShellMs,
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
      schema: 2, revision, variant, runId, capturedAtUtc: new Date().toISOString(),
      // Wall-clock opening timings from this harness exclude UI form login.
      // Older reports (without this field) used 'form-login-v1'.
      bootstrapMode: 'persisted-e2e-session-v1',
      requestedRenderer: requested,
      browserVersion: browser.version(),
      profile: profile.id, viewport: profile.viewport,
      emulatedTouch: profile.touch, physicalAndroidVerified: false,
      browserFramePacingOnly: !visits.some(({ gpuTimerQueryMeasured }) => gpuTimerQueryMeasured),
      visits,
    };
    await mkdir(outputDir, { recursive: true });
    await writeFile(resolve(outputDir, revision + '-' + variant + '-' + requested + '-' + profile.id + '-' + runId + '.json'), JSON.stringify(report, null, 2) + '\n');
    console.log('WAR_ROOM_GPU_BENCH ' + JSON.stringify({
      revision, variant, runId, profile: profile.id, renderer: requested,
      visits: visits.map(({ visitType, hansStage, hansReadyAfterShellMs, idle, move }) => ({
        visitType, hansStage, hansReadyAfterShellMs,
        idleRafP95Ms: idle.rafP95Ms, moveRafP95Ms: move.rafP95Ms,
        idleGpuQueries: idle.gpuTimer.samplesMs.length,
        moveGpuQueries: move.gpuTimer.samplesMs.length,
        idleRenderedFrames: idle.renderCost.renderedFrames,
        moveRenderedFrames: move.renderCost.renderedFrames,
        moveConfirmationMs: move.inputToConfirmationMs,
      })),
    }));
  });
}
