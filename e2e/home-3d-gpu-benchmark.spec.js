import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { mockApi } from './helpers.js';
import { homeBlenderDistinctGpuSamplesMs } from '../frontend/src/components/HomeBlenderPerformanceDiagnostics.js';
import { summarizeHomeGpuLightContrast } from './home-blender-gpu-light-contrast.mjs';
import { parseHomeGpuFlameEligibility } from './home-gpu-flame-eligibility.mjs';
import { homeGpuBenchmarkAmbientHour } from './home-gpu-ambient-clock.mjs';
import { homeGpuBenchmarkRevision, homeGpuPhysicalCheckoutProvenance } from './home-gpu-revision.mjs';

// Explicit, local-only hardware diagnostic. CI excludes this file from its
// standard Playwright matrix; no identity, passwords or raw GPU names are logged.
const requested = process.env.CHESS_HOME_GPU_MODE;
const idleProbe = process.env.CHESS_HOME_GPU_IDLE_PROBE === '1';
const lightProbe = process.env.CHESS_HOME_GPU_LIGHT_PROBE === '1';
const lightProbeFamily = String(process.env.CHESS_HOME_GPU_LIGHT_GROUP || 'all').trim().toLowerCase();
// Legacy is intentionally the default to keep historical A/B reports
// comparable. Choose production explicitly for the current two-fill Home.
const lightBaseline = String(process.env.CHESS_HOME_GPU_BASELINE || 'legacy')
  .trim().toLowerCase();
const productionBaseline = lightBaseline === 'production';
const baseMode = productionBaseline ? 'pair-normal' : 'normal';
const lightFamilyCounts = Object.freeze({
  all: 12, wall: 4, board: 2, stairs: 3, accent: 3,
  'accent-dungeon': 1, 'accent-table': 1, 'accent-reading': 1,
  'wall-pair': 4, // original torches disabled, two wider fills added
});
const lightOffMode = productionBaseline ? `pair-aux-${lightProbeFamily}-off`
  : lightProbeFamily === 'all' ? 'aux-off'
    : lightProbeFamily === 'wall-pair' ? 'wall-pair'
      : `aux-${lightProbeFamily}-off`;
const expectedVendor = (process.env.CHESS_HOME_GPU_EXPECT_VENDOR || '').trim().toLowerCase();
// Fix the in-browser local hour only in explicitly opt-in lighting trials.
// Otherwise morning/night comparisons measure different source lighting.
const lightProbeAmbient = String(process.env.CHESS_HOME_GPU_AMBIENT || 'night')
  .trim().toLowerCase();
// A/B/B/A trials require a real timer. Do not substitute browser CPU timing
// or software GPU for fragment-shading costs.
const requireTimer = lightProbe || process.env.CHESS_HOME_GPU_REQUIRE_TIMER === '1';
const requireDrawCensus = process.env.CHESS_HOME_GPU_REQUIRE_DRAW_CENSUS === '1';
const artifactDir = '../.artifacts/home-gpu-benchmark';

function median(numbers) {
  const values = numbers.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!values.length) return null;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}

async function openRealHome(page, lightMode = 'normal') {
  const ambientHour = homeGpuBenchmarkAmbientHour({
    lightProbe,
    drawCensus: requireDrawCensus,
    ambient: lightProbeAmbient,
  });
  if (ambientHour != null) {
    // Only Playwright probe contexts see this override; real timers are unchanged.
    await page.addInitScript((hour) => {
      Object.defineProperty(Date.prototype, 'getHours', {
        configurable: true,
        writable: true,
        value() { return hour; },
      });
    }, ambientHour);
  }
  await page.addInitScript(() => {
    // Home's desktop GLTF policy needs a capable CPU report. This does not
    // change the renderer and must never be used to claim a physical GPU.
    Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', {
      configurable: true,
      get: () => 8,
    });
  });
  await mockApi(page, {
    profileSeed: {
      'matthias.onboarded': '2',
      'chess-study-home-guide-dismissed-v1': '1',
    },
  });
  // Mark BOTH variants as a controlled trial: otherwise only the B branch
  // would hold full LOD while the baseline could automatically degrade.
  // Capture the true production path separately from locked-LOD A/B.
  // These two modes do not enable GPU profiling or override lighting flags.
  const query = lightProbe && lightMode === 'production' ? './'
    : lightProbe && lightMode === 'legacy-rollback' ? './?homeWallTorches=legacy'
      : lightProbe ? `./?homeGpuProfile=1&homeLightProbe=${lightMode}`
        : './?homeGpuProfile=1';
  await page.goto(query, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Usuario').fill('e2e');
  const password = page.getByLabel('Contraseña');
  await password.fill('clave123456');
  await password.press('Enter');
  await expect(page.getByRole('region', { name: 'Modos principales', exact: true }))
    .toBeVisible({ timeout: 45_000 });
  const castle = page.locator('.illustrated-home__castle-3d');
  await expect(castle).toHaveClass(/is-ready/, { timeout: 90_000 });
  await expect(castle).toHaveAttribute('data-home-blender-runtime', 'ready');
  await expect(castle).toHaveAttribute('data-home-castle-compositor', 'blender-runtime');
  // The hall marks ready before the separate Matthias GLB has mounted. A
  // benchmark captured during that transition compares different scenes,
  // especially when the light probe compiles different shader permutations.
  await expect(castle, 'Benchmark requires Matthias inside the real 3D hall')
    .toHaveAttribute('data-home-matthias-actor', 'ready', { timeout: 75_000 });
  await expect(page.locator('.home-3d-loading')).toHaveCount(0, { timeout: 45_000 });
  return castle;
}

async function readRealCanvas(castle) {
  const raw = await castle.evaluate((canvas) => {
    const d = canvas.dataset;
    // Reuse the GL context of the *actual* Home canvas. Do not create a
    // separate benchmark context that might select a different GPU.
    const gl = canvas.getContext('webgl2');
    const rendererInfo = gl?.getExtension('WEBGL_debug_renderer_info');
    let rawRenderer = '';
    if (gl && rendererInfo) {
      try {
        rawRenderer = String(gl.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL) || '');
      } catch { /* Missing device diagnostics are reported as unknown. */ }
    }
    const software = d.homeBlenderSoftware === 'true'
      || /swiftshader|llvmpipe|softpipe|software|basic render/i.test(rawRenderer);
    const vendor = /nvidia|geforce/i.test(rawRenderer) ? 'nvidia'
      : /radeon|\bamd\b/i.test(rawRenderer) ? 'amd'
        : /intel|iris/i.test(rawRenderer) ? 'intel'
          : /apple/i.test(rawRenderer) ? 'apple'
            : /adreno/i.test(rawRenderer) ? 'adreno'
              : /mali/i.test(rawRenderer) ? 'mali'
                : /powervr/i.test(rawRenderer) ? 'powervr' : 'unknown';
    const actual = software ? 'software' : vendor !== 'unknown' ? 'hardware' : 'unknown';
    // A coarse, repeatable renderer-model fingerprint; raw GPU model/driver
    // strings never leave this page or appear in the artifact/logs.
    // This is not a device ID: two machines with the same model may match.
    let fingerprint = 2166136261;
    for (const char of rawRenderer) {
      fingerprint ^= char.charCodeAt(0);
      fingerprint = Math.imul(fingerprint, 16777619);
    }
    const rendererFingerprint = rawRenderer
      ? (fingerprint >>> 0).toString(16).padStart(8, '0') : null;
    const num = (key) => {
      const value = d[key];
      return value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
    };
    let modelDrawInventory = null;
    try {
      const candidate = JSON.parse(d.homeBlenderModelDrawInventory || 'null');
      if (candidate && typeof candidate === 'object') modelDrawInventory = candidate;
    } catch { /* Keep missing inventory explicit. */ }
    const pass = (key) => {
      try {
        const candidate = JSON.parse(d[key] || 'null');
        return candidate && Number.isSafeInteger(candidate.totalCalls) ? candidate : null;
      } catch { return null; }
    };
    let startupMs = null;
    try {
      const events = JSON.parse(d.homeBlenderStartup || '{}');
      startupMs = Number.isFinite(events.ready) ? events.ready : null;
    } catch { /* Retain null. */ }
    return {
      actual, vendor, software, lod: d.homeCastleLod || null,
      shadows: d.homeBlenderShadows || null,
      lightProbe: d.homeBlenderLightProbe || null,
      lightProbeLod: d.homeBlenderLightProbeLod || null,
      auxiliaryLightsDisabled: num('homeBlenderLightProbeDisabled'),
      auxiliaryLightsAdded: num('homeBlenderLightProbeAdded'),
      matthiasActor: d.homeMatthiasActor || 'missing',
      matthiasStation: d.homeMatthiasStation || 'missing',
      ambient: d.homeBlenderAmbient || null, rendererFingerprint,
      gpuStatus: d.homeBlenderGpuStatus || 'missing',
      gpuMs: num('homeBlenderGpuMs'),
      gpuSampleCount: num('homeBlenderGpuSampleCount'),
      drawCalls: num('homeBlenderDrawCalls'),
      drawPass: pass('homeBlenderDrawPass'),
      firstFrameDrawPass: pass('homeBlenderFirstFrameDrawPass'),
      triangles: num('homeBlenderTriangles'),
      initialDrawCalls: num('homeBlenderFirstFrameDrawCalls'),
      initialTriangles: num('homeBlenderFirstFrameTriangles'),
      allocatedTextures: num('homeBlenderGpuTextures'),
      allocatedGeometries: num('homeBlenderGpuGeometries'),
      allocatedPrograms: num('homeBlenderGpuPrograms'),
      modelDrawInventory,
      flamePassEligibilityJson: d.homeBlenderFlamePassEligibility || null,
      flamePassLiveEligibilityJson: d.homeBlenderFlamePassLiveEligibility || null,
      cpuP95Ms: num('homeBlenderCpuP95Ms'),
      rafGapP95Ms: num('homeBlenderVsyncP95Ms'),
      animatedDrawsPerSecond: num('homeBlenderDrawnFps'),
      startupMs,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
    };
  });
  const { flamePassEligibilityJson, flamePassLiveEligibilityJson, ...snapshot } = raw;
  return {
    ...snapshot,
    flamePassEligibility: parseHomeGpuFlameEligibility(flamePassEligibilityJson),
    flamePassLiveEligibility: parseHomeGpuFlameEligibility(flamePassLiveEligibilityJson),
  };
}

if (!idleProbe) test('Home 3D physical GPU benchmark · three visits or opt-in light A/B/B/A', async ({ browser, baseURL }) => {
  test.setTimeout(lightProbe ? 600_000 : 450_000);
  if (lightProbe && requested !== 'hardware') {
    throw new Error('CHESS_HOME_GPU_LIGHT_PROBE=1 requires CHESS_HOME_GPU_MODE=hardware');
  }
  if (lightProbe && !['legacy', 'production'].includes(lightBaseline)) {
    throw new Error('CHESS_HOME_GPU_BASELINE must be legacy or production');
  }
  if (lightProbe && !Object.hasOwn(lightFamilyCounts, lightProbeFamily)) {
    throw new Error('Unknown CHESS_HOME_GPU_LIGHT_GROUP: choose all, wall, board, stairs, accent, accent-dungeon, accent-table, accent-reading or wall-pair');
  }
  if (lightProbe && productionBaseline && ![
    'board', 'stairs', 'accent',
    'accent-dungeon', 'accent-table', 'accent-reading',
  ].includes(lightProbeFamily)) {
    throw new Error('Production two-fill GPU baseline supports only board, stairs and accent groups or individually named accent lights');
  }
  if (lightProbe && !productionBaseline && lightProbeFamily.startsWith('accent-')) {
    throw new Error('Single-accent GPU probes require HOME_GPU_BASELINE=production');
  }
  // Reject invalid controlled ambient before starting Chromium visits.
  homeGpuBenchmarkAmbientHour({ lightProbe, drawCensus: requireDrawCensus, ambient: lightProbeAmbient });
  if (process.env.CHESS_E2E_LIGHTWEIGHT === '1') {
    throw new Error('CHESS_E2E_LIGHTWEIGHT=1 forces a 2D Home and cannot benchmark GPU rendering');
  }
  // Fail closed before expensive GPU/browser work on untraceable hardware runs.
  const revision = requested === 'hardware'
    ? homeGpuPhysicalCheckoutProvenance(
      process.env.CHESS_HOME_GPU_REVISION,
      execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }),
      execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=no'],
        { encoding: 'utf8' }),
    )
    : homeGpuBenchmarkRevision(process.env.CHESS_HOME_GPU_REVISION);

  const visits = [];
  // Alternating order counters warmup/drift and always uses a fresh browser
  // context, identical build, camera, viewport and ambient period.
  const sequence = lightProbe
    ? [baseMode, lightOffMode, lightOffMode, baseMode]
    : ['normal', 'normal', 'normal'];
  for (let index = 0; index < sequence.length; index += 1) {
    const context = await browser.newContext({
      baseURL,
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      reducedMotion: 'no-preference',
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    let modelRequests = 0;
    page.on('request', (request) => {
      try {
        if (new URL(request.url()).pathname.toLowerCase().endsWith('.glb')) modelRequests += 1;
      } catch { /* Do not log request URLs. */ }
    });
    try {
      const castle = await openRealHome(page, sequence[index]);
      // This workload measures active ambience. A late actor download must
      // not accidentally sample a Home that already entered deep idle.
      await page.mouse.move(20, 150);
      // Wait for one real post-actor render interval before recording a GPU
      // query watermark. A pending pre-actor query might still complete; the
      // watermark excludes already completed results, and the first fresh
      // query is discarded to guard against that pending boundary.
      await page.waitForTimeout(1_500);
      const settled = await readRealCanvas(castle);
      const settledGpuCount = settled.gpuSampleCount;
      const snapshots = [];
      // Sample after both Home and Matthias are ready, not loading/compilation.
      // The scene throttles animation by design, so "draws/s" != display FPS.
      for (let sample = 0; sample < 4; sample += 1) {
        await page.waitForTimeout(2_000);
        snapshots.push(await readRealCanvas(castle));
      }
      const last = snapshots[snapshots.length - 1];
      // The same most-recent GPU result may survive several 2s reads.
      // Count only new completed WebGL queries: duplicated reads must not
      // artificially inflate the sample size or bias the median.
      const freshSamples = homeBlenderDistinctGpuSamplesMs(
        snapshots, Number.isSafeInteger(settledGpuCount) ? settledGpuCount : 0,
      );
      // With asynchronous WebGL queries, the first result since the
      // watermark may have been submitted while Matthias was still loading.
      // Exclude that ambiguous boundary, rather than calling it a stable
      // post-actor GPU frame. Retain normal benchmark behaviour where no
      // hardware timer was available.
      const gpuSamplesMs = lightProbe ? freshSamples.slice(1) : freshSamples;
      const row = {
        visit: index + 1,
        gpuSamplesWatermark: settledGpuCount,
        ...last,
        gpuSamplesMs,
        gpuMedianMs: median(gpuSamplesMs),
        cpuP95MedianMs: median(snapshots.map((sample) => sample.cpuP95Ms)),
        rafGapP95MedianMs: median(snapshots.map((sample) => sample.rafGapP95Ms)),
        modelRequests,
      };
      console.log('HOME_3D_GPU_BENCH ' + JSON.stringify(row));
      expect(row.actual, 'Verify the renderer of the actual Home canvas, not browser launch flags')
        .toBe(requested);
      if (expectedVendor) {
        expect(row.vendor,
          `Chromium used ${row.vendor}, not the requested ${expectedVendor} GPU; check PRIME/ANGLE offload or use HOME_GPU_NVIDIA_PRIME=0 for native GPU`)
          .toBe(expectedVendor);
      }
      if (lightProbe) {
        expect(row.ambient, 'All visits must use the explicitly frozen local Home lighting period')
          .toBe(lightProbeAmbient);
      }
      expect(row.matthiasActor, 'All visits must render the actual Matthias actor').toBe('ready');
      expect(snapshots.every((snapshot) => snapshot.matthiasActor === 'ready'),
        'No GPU snapshot can be taken before Matthias finishes mounting').toBe(true);
      if (lightProbe) {
        expect(row.lightProbe).toBe(sequence[index]);
        expect(row.lightProbeLod, 'Full source scene must stay pinned throughout light A/B')
          .toBe('full-locked');
        expect(snapshots.every((snapshot) =>
          snapshot.lod === 'full' && snapshot.lightProbeLod === 'full-locked'),
        'Every GPU sample must be from the same full LOD source').toBe(true);
        expect(row.lod, 'Compare fully lit full-LOD Home only').toBe('full');
        expect(row.shadows, 'Both variants must keep the key shadow pass').toBe('enabled');
        const expectedDisabled = productionBaseline
          ? 4 + (sequence[index] === baseMode ? 0 : lightFamilyCounts[lightProbeFamily])
          : sequence[index] === 'normal' ? 0 : lightFamilyCounts[lightProbeFamily];
        const expectedAdded = productionBaseline ? 2
          : lightProbeFamily === 'wall-pair' && sequence[index] !== baseMode ? 2 : 0;
        expect(row.auxiliaryLightsAdded,
          'Two wall fills must exist in BOTH production-baseline variants')
          .toBe(expectedAdded);
        expect(snapshots.every((snapshot) => snapshot.auxiliaryLightsAdded === expectedAdded),
          'No snapshots may change the number of experimental fill lights').toBe(true);
        expect(row.auxiliaryLightsDisabled,
          'The probe must exclude exactly the intended family, not unrelated lights')
          .toBe(expectedDisabled);
        expect(row.gpuSamplesMs.length, 'A/B requires fresh hardware GPU timer results in every visit')
          .toBeGreaterThan(0);
      }
      expect(row.canvasWidth * row.canvasHeight).toBeGreaterThan(0);
      expect(row.initialDrawCalls).toBeGreaterThan(0);
      expect(row.initialTriangles).toBeGreaterThan(0);
      // Diagnostic measurements: an unavailable split is explicit null, not
      // an invented zero. When present, verify the observed render identity.
      if (row.drawPass) {
        expect(row.drawPass.mainCalls + row.drawPass.shadowCalls).toBe(row.drawPass.totalCalls);
        if (row.drawPass.families) {
          for (const phase of ['main', 'shadow']) {
            const families = row.drawPass.families[phase];
            const total = families.castle + families.matthias + families.runtime;
            expect(total).toBe(row.drawPass[phase + 'Calls']);
          }
        }
      }
      if (row.firstFrameDrawPass) {
        expect(row.firstFrameDrawPass.mainCalls + row.firstFrameDrawPass.shadowCalls)
          .toBe(row.firstFrameDrawPass.totalCalls);
      }
      if (requireDrawCensus) {
        expect(!lightProbe, 'Draw census runner measures unmodified production lights').toBe(true);
        expect(row.drawPass?.families, 'Actual sustained draw families must be available').toBeTruthy();
        expect(row.firstFrameDrawPass?.families, 'First-frame draw families must be available').toBeTruthy();
        const validate = (pass) => {
          expect(pass.totalCalls).toBeGreaterThan(0);
          expect(pass.mainCalls + pass.shadowCalls).toBe(pass.totalCalls);
          for (const phase of ['main', 'shadow']) {
            const group = pass.families[phase];
            expect(group.castle + group.matthias + group.runtime)
              .toBe(pass[phase + 'Calls']);
          }
        };
        validate(row.drawPass);
        validate(row.firstFrameDrawPass);
        expect(row.drawPass.families.main.castle,
          'The real hall GLB must contribute sustained direct submissions').toBeGreaterThan(0);
        expect(row.drawPass.families.main.matthias,
          'The independently loaded Matthias actor must contribute real draws').toBeGreaterThan(0);
      }
      expect(row.allocatedTextures).toBeGreaterThan(0);
      expect(row.allocatedGeometries).toBeGreaterThan(0);
      expect(row.modelDrawInventory?.drawSlotCandidates).toBeGreaterThan(0);
      expect(row.modelDrawInventory?.uniqueGeometries).toBeGreaterThan(0);
      expect(row.startupMs).toBeGreaterThan(0);
      expect(row.modelRequests, 'The Home GLB must be requested, not a static fallback')
        .toBeGreaterThan(0);
      if (requested === 'hardware' && requireTimer) {
        expect(row.gpuSamplesMs.length, 'Driver did not return a valid async GPU timing query')
          .toBeGreaterThan(0);
      }
      // Real full-resolution screenshots from the SAME physical WebGL canvas,
      // only for the opt-in wall-pair trial. Never use CI SwiftShader or a
      // synthetic concept illustration as visual acceptance.
      if (lightProbe && lightProbeFamily === 'wall-pair' && index < 2) {
        await mkdir(artifactDir, { recursive: true });
        const name = index === 0 ? 'baseline' : 'two-fill-candidate';
        await castle.screenshot({
          path: `${artifactDir}/home-3d-wall-pair-${name}-hardware.png`,
        });
      }
      visits.push(row);
    } finally {
      await context.close();
    }
  }
  if (lightProbe && lightProbeFamily === 'wall-pair') {
    // Verify and capture actual player-facing production and rollback entry:
    // neither URL has the profiling flags used by the A/B lighting trial.
    for (const { mode, layout, screenshot } of [
      { mode: 'production', layout: 'pair', screenshot: 'production-default' },
      { mode: 'legacy-rollback', layout: 'legacy', screenshot: 'production-legacy-rollback' },
    ]) {
      const context = await browser.newContext({
        baseURL,
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
        reducedMotion: 'no-preference',
        serviceWorkers: 'block',
      });
      try {
        const page = await context.newPage();
        const castle = await openRealHome(page, mode);
        await expect(castle, 'Production and rollback must use the selected lights')
          .toHaveAttribute('data-home-wall-torches', layout);
        const snapshot = await readRealCanvas(castle);
        expect(snapshot.actual, 'Visual proof must use physical GPU WebGL').toBe('hardware');
        if (expectedVendor) expect(snapshot.vendor).toBe(expectedVendor);
        expect(snapshot.ambient).toBe(lightProbeAmbient);
        expect(snapshot.matthiasActor).toBe('ready');
        expect(snapshot.lod).toBe('full');
        // This viewport is the same as the user-approved A/B canvas.
        await mkdir(artifactDir, { recursive: true });
        await castle.screenshot({
          path: `${artifactDir}/home-3d-wall-pair-${screenshot}-hardware.png`,
        });
      } finally {
        await context.close();
      }
    }
  }
  if (lightProbe) {
    const reference = visits[0];
    for (const row of visits.slice(1)) {
      for (const key of ['actual', 'vendor', 'rendererFingerprint', 'lod', 'shadows',
        'ambient', 'canvasWidth', 'canvasHeight', 'initialTriangles', 'matthiasActor',
        'matthiasStation', 'lightProbeLod']) {
        expect(row[key], `Home A/B/B/A is not comparable: mismatched ${key}`).toEqual(reference[key]);
      }
    }
    expect(visits[1].auxiliaryLightsDisabled).toBe(visits[2].auxiliaryLightsDisabled);
    // Fail closed if a family-labelled B condition is absent, or if any
    // aggregate timing is null/NaN. JS arithmetic silently coerces null to
    // zero and previously fabricated a 100% saving for aux-board-off.
    const contrast = summarizeHomeGpuLightContrast(visits, lightOffMode, baseMode);
    const result = {
      schema: 1,
      surface: 'Home Blender 3D auxiliary light isolation',
      lightFamily: lightProbeFamily,
      baselineLayout: lightBaseline,
      baselineMode: baseMode,
      benchmarkAmbient: lightProbeAmbient,
      revision,
      mode: requested,
      browserVersion: browser.version(),
      viewport: { width: 1440, height: 900, dpr: 1 },
      sequence,
      matchingRendererFingerprint: reference.rendererFingerprint,
      ambient: reference.ambient,
      lod: reference.lod,
      shadows: reference.shadows,
      auxiliaryLightsExcluded: visits[1].auxiliaryLightsDisabled,
      auxiliaryLightsAdded: visits[1].auxiliaryLightsAdded,
      // Contrast between *different rendered scenes*, not an FPS estimate
      // or a recommendation to remove lights in production.
      ...contrast,
      visits,
    };
    await mkdir(artifactDir, { recursive: true });
    const reportName = productionBaseline
      ? `home-3d-light-probe-${lightProbeFamily}-production-hardware.json`
      : lightProbeFamily === 'all' ? 'home-3d-light-probe-hardware.json'
        : `home-3d-light-probe-${lightProbeFamily}-hardware.json`;
    await writeFile(`${artifactDir}/${reportName}`,
      `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    console.log('HOME_3D_LIGHT_PROBE ' + JSON.stringify({
      sequence, lightFamily: lightProbeFamily, baselineLayout: lightBaseline,
      ambient: result.benchmarkAmbient,
      auxiliaryLightsExcluded: result.auxiliaryLightsExcluded,
      auxiliaryLightsAdded: result.auxiliaryLightsAdded,
      stability: result.stability,
      gpuMedianMs: result.gpuMedianMs,
      gpuDifferenceMs: result.gpuDifferenceMs,
      gpuContrastPct: result.gpuContrastPct,
    }));
    return;
  }
  if (requireDrawCensus && !lightProbe) {
    const reference = visits[0];
    for (const row of visits.slice(1)) {
      for (const field of ['actual', 'vendor', 'rendererFingerprint', 'lod', 'shadows', 'ambient', 'matthiasStation', 'canvasWidth', 'canvasHeight']) {
        expect(row[field]).toEqual(reference[field]);
      }
    }
  }
  const summary = {
    schema: 2,
    surface: 'Home Blender 3D',
    mode: requested,
    revision,
    browserVersion: browser.version(),
    viewport: { width: 1440, height: 900, dpr: 1 },
    requireTimer,
    requireDrawCensus,
    // Only medians of physical observations, never inferred GPU ms or VRAM MB.
    medians: {
      startupMs: median(visits.map((visit) => visit.startupMs)),
      initialDrawCalls: median(visits.map((visit) => visit.initialDrawCalls)),
      shadowDrawCalls: median(visits.map((visit) => visit.drawPass?.shadowCalls)),
      mainDrawCalls: median(visits.map((visit) => visit.drawPass?.mainCalls)),
      firstFrameShadowDrawCalls: median(visits.map((visit) => visit.firstFrameDrawPass?.shadowCalls)),
      firstFrameMainDrawCalls: median(visits.map((visit) => visit.firstFrameDrawPass?.mainCalls)),
      mainCastleDrawCalls: median(visits.map((visit) => visit.drawPass?.families?.main?.castle)),
      mainMatthiasDrawCalls: median(visits.map((visit) => visit.drawPass?.families?.main?.matthias)),
      mainRuntimeDrawCalls: median(visits.map((visit) => visit.drawPass?.families?.main?.runtime)),
      shadowCastleDrawCalls: median(visits.map((visit) => visit.drawPass?.families?.shadow?.castle)),
      shadowMatthiasDrawCalls: median(visits.map((visit) => visit.drawPass?.families?.shadow?.matthias)),
      shadowRuntimeDrawCalls: median(visits.map((visit) => visit.drawPass?.families?.shadow?.runtime)),
      allocatedTextures: median(visits.map((visit) => visit.allocatedTextures)),
      allocatedGeometries: median(visits.map((visit) => visit.allocatedGeometries)),
      // One-time authored-model draw candidates, never actual GL submissions.
      modelDrawSlots: median(visits.map((visit) => visit.modelDrawInventory?.drawSlotCandidates)),
      modelShadowCasterSlots: median(visits.map((visit) => visit.modelDrawInventory?.shadowCasterSlots)),
      modelTransparentSlots: median(visits.map((visit) => visit.modelDrawInventory?.transparentSlots)),
      modelUniqueGeometries: median(visits.map((visit) => visit.modelDrawInventory?.uniqueGeometries)),
      modelUniqueMaterials: median(visits.map((visit) => visit.modelDrawInventory?.uniqueMaterials)),
      cpuP95Ms: median(visits.map((visit) => visit.cpuP95MedianMs)),
      rafGapP95Ms: median(visits.map((visit) => visit.rafGapP95MedianMs)),
      gpuMs: median(visits.map((visit) => visit.gpuMedianMs)),
    },
    visits,
  };
  await mkdir(artifactDir, { recursive: true });
  await writeFile(`${artifactDir}/home-3d-${requested}.json`, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log('HOME_3D_GPU_SUMMARY ' + JSON.stringify(summary.medians));
});

if (idleProbe) test('Home 3D physical GPU · visible idle sleeps and real input resumes the same scene', async ({ browser, baseURL }) => {
  test.setTimeout(300_000);
  expect(requested).toBe('hardware');
  const revision = homeGpuPhysicalCheckoutProvenance(
    process.env.CHESS_HOME_GPU_REVISION,
    execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }),
    execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=no'], { encoding: 'utf8' }),
  );
  const visits = [];
  await mkdir(artifactDir, { recursive: true });
  for (const viewport of [{ width: 1440, height: 900 }, { width: 844, height: 390 }]) {
    const touch = viewport.width < 1000;
    const context = await browser.newContext({
      baseURL, viewport, deviceScaleFactor: 1, reducedMotion: 'no-preference',
      isMobile: touch, hasTouch: touch, serviceWorkers: 'block',
    });
    try {
      const page = await context.newPage();
      let modelRequests = 0;
      page.on('request', (request) => {
        if (/\.glb(?:\?|$)/i.test(request.url())) modelRequests += 1;
      });
      const castle = await openRealHome(page);
      const initial = await readRealCanvas(castle);
      expect(initial.actual).toBe('hardware');
      if (expectedVendor) expect(initial.vendor).toBe(expectedVendor);
      const original = await castle.elementHandle();
      const startup = await castle.getAttribute('data-home-blender-startup');
      await page.mouse.move(20, 150);
      await expect(castle).toHaveAttribute('data-home-fire-motion', 'live');
      const countPaints = () => castle.evaluate((node) => new Promise((resolve) => {
        let paints = 0;
        let hidden = document.hidden;
        const visibility = () => { hidden ||= document.hidden; };
        const observer = new MutationObserver((records) => {
          paints += records.filter(({ attributeName }) => attributeName === 'data-home-blender-draw-pass').length;
        });
        document.addEventListener('visibilitychange', visibility);
        observer.observe(node, { attributes: true, attributeFilter: ['data-home-blender-draw-pass'] });
        setTimeout(() => {
          observer.disconnect();
          document.removeEventListener('visibilitychange', visibility);
          resolve({ paints, hidden: hidden || document.hidden });
        }, 2_500);
      }));
      const active = await countPaints();
      expect(active.hidden).toBe(false);
      expect(active.paints).toBeGreaterThan(0);
      await castle.evaluate((node) => {
        const host = node.closest('.illustrated-home');
        const audit = { inputs: 0, visibilityChanges: 0 };
        const input = () => { audit.inputs += 1; };
        const visibility = () => { audit.visibilityChanges += 1; };
        const events = ['pointermove', 'pointerdown', 'wheel', 'keydown', 'focusin'];
        for (const event of events) host.addEventListener(event, input, { passive: true });
        document.addEventListener('visibilitychange', visibility);
        node.__finishIdleInputAudit = () => {
          for (const event of events) host.removeEventListener(event, input);
          document.removeEventListener('visibilitychange', visibility);
          delete node.__finishIdleInputAudit;
          return audit;
        };
      });
      try {
        await expect(castle).toHaveAttribute('data-home-fire-motion', 'idle', { timeout: 35_000 });
      } finally {
        const audit = await castle.evaluate((node) => node.__finishIdleInputAudit());
        expect(audit, 'Idle evidence requires uninterrupted foreground inactivity')
          .toEqual({ inputs: 0, visibilityChanges: 0 });
      }
      const requestsAtIdle = modelRequests;
      const idle = await countPaints();
      expect(idle).toEqual({ paints: 0, hidden: false });
      await page.screenshot({
        path: `${artifactDir}/home-idle-${viewport.width}x${viewport.height}.png`,
        animations: 'disabled', timeout: 45_000,
      });
      // Focus reaches the real hotspot while the canvas ignores pointer events.
      await page.locator('.illustrated-home__destination--play').focus();
      await expect(castle).toHaveAttribute('data-home-fire-motion', 'live');
      const resumed = await countPaints();
      expect(resumed.hidden).toBe(false);
      expect(resumed.paints).toBeGreaterThan(0);
      expect(await castle.evaluate((node, old) => node === old, original)).toBe(true);
      expect(await castle.getAttribute('data-home-blender-startup')).toBe(startup);
      expect(modelRequests).toBe(requestsAtIdle);
      const final = await readRealCanvas(castle);
      expect(final.rendererFingerprint).toBe(initial.rendererFingerprint);
      visits.push({ viewport, touch, actual: final.actual, vendor: final.vendor,
        rendererFingerprint: final.rendererFingerprint, active, idle, resumed, sameCanvas: true });
      await original.dispose();
    } finally {
      await context.close();
    }
  }
  await writeFile(`${artifactDir}/home-idle-hardware.json`, JSON.stringify({
    schema: 1, revision, browserVersion: browser.version(),
    requestedBackend: process.env.CHESS_HOME_GPU_BACKEND || 'gl', sampleWindowMs: 2_500, visits,
  }, null, 2) + '\n');
  console.log('HOME_IDLE_GPU ' + JSON.stringify(visits));
});
