import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { mockApi } from './helpers.js';
import { homeBlenderDistinctGpuSamplesMs } from '../frontend/src/components/HomeBlenderPerformanceDiagnostics.js';
import { summarizeHomeGpuLightContrast } from './home-blender-gpu-light-contrast.mjs';

// Explicit, local-only hardware diagnostic. CI excludes this file from its
// standard Playwright matrix; no identity, passwords or raw GPU names are logged.
const requested = process.env.CHESS_HOME_GPU_MODE;
const lightProbe = process.env.CHESS_HOME_GPU_LIGHT_PROBE === '1';
const lightProbeFamily = String(process.env.CHESS_HOME_GPU_LIGHT_GROUP || 'all').trim().toLowerCase();
const lightFamilyCounts = Object.freeze({
  all: 12, wall: 4, board: 2, stairs: 3, accent: 3,
  'wall-pair': 4, // original torches disabled, two wider fills added
});
const lightOffMode = lightProbeFamily === 'all' ? 'aux-off'
  : lightProbeFamily === 'wall-pair' ? 'wall-pair'
    : `aux-${lightProbeFamily}-off`;
const expectedVendor = (process.env.CHESS_HOME_GPU_EXPECT_VENDOR || '').trim().toLowerCase();
// Fix the in-browser local hour only in explicitly opt-in lighting trials.
// Otherwise morning/night comparisons measure different source lighting.
const lightProbeAmbient = String(process.env.CHESS_HOME_GPU_AMBIENT || 'night')
  .trim().toLowerCase();
const LIGHT_PROBE_AMBIENT_HOUR = Object.freeze({
  dawn: 7, day: 13, dusk: 19, night: 23,
});
// A/B/B/A trials require a real timer. Do not substitute browser CPU timing
// or software GPU for fragment-shading costs.
const requireTimer = lightProbe || process.env.CHESS_HOME_GPU_REQUIRE_TIMER === '1';
const artifactDir = '../.artifacts/home-gpu-benchmark';

function median(numbers) {
  const values = numbers.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!values.length) return null;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}

async function openRealHome(page, lightMode = 'normal') {
  if (lightProbe) {
    // Test-context-only clock: the game's authored ambient and Matthias
    // routine derive from Date#getHours. Do not touch production behavior,
    // system time, performance.now, Date.now or real scheduling intervals.
    await page.addInitScript((hour) => {
      Object.defineProperty(Date.prototype, 'getHours', {
        configurable: true,
        writable: true,
        value() { return hour; },
      });
    }, LIGHT_PROBE_AMBIENT_HOUR[lightProbeAmbient]);
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
  const query = lightProbe
    ? `./?homeGpuProfile=1&homeLightProbe=${lightMode}`
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
  return castle.evaluate((canvas) => {
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
      triangles: num('homeBlenderTriangles'),
      initialDrawCalls: num('homeBlenderFirstFrameDrawCalls'),
      initialTriangles: num('homeBlenderFirstFrameTriangles'),
      allocatedTextures: num('homeBlenderGpuTextures'),
      allocatedGeometries: num('homeBlenderGpuGeometries'),
      allocatedPrograms: num('homeBlenderGpuPrograms'),
      modelDrawInventory,
      cpuP95Ms: num('homeBlenderCpuP95Ms'),
      rafGapP95Ms: num('homeBlenderVsyncP95Ms'),
      animatedDrawsPerSecond: num('homeBlenderDrawnFps'),
      startupMs,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
    };
  });
}

test('Home 3D physical GPU benchmark · three visits or opt-in light A/B/B/A', async ({ browser, baseURL }) => {
  test.setTimeout(lightProbe ? 600_000 : 450_000);
  if (lightProbe && requested !== 'hardware') {
    throw new Error('CHESS_HOME_GPU_LIGHT_PROBE=1 requires CHESS_HOME_GPU_MODE=hardware');
  }
  if (lightProbe && !Object.hasOwn(lightFamilyCounts, lightProbeFamily)) {
    throw new Error('Unknown CHESS_HOME_GPU_LIGHT_GROUP: choose all, wall, board, stairs, accent, or wall-pair');
  }
  if (lightProbe && !Object.hasOwn(LIGHT_PROBE_AMBIENT_HOUR, lightProbeAmbient)) {
    throw new Error('Unknown CHESS_HOME_GPU_AMBIENT: choose dawn, day, dusk, or night');
  }
  if (process.env.CHESS_E2E_LIGHTWEIGHT === '1') {
    throw new Error('CHESS_E2E_LIGHTWEIGHT=1 forces a 2D Home and cannot benchmark GPU rendering');
  }
  const visits = [];
  // Alternating order counters warmup/drift and always uses a fresh browser
  // context, identical build, camera, viewport and ambient period.
  const sequence = lightProbe
    ? ['normal', lightOffMode, lightOffMode, 'normal']
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
        const expectedDisabled = sequence[index] === 'normal'
          ? 0 : lightFamilyCounts[lightProbeFamily];
        const expectedAdded = lightProbeFamily === 'wall-pair'
          && sequence[index] !== 'normal' ? 2 : 0;
        expect(row.auxiliaryLightsAdded,
          'Only the wall-pair experimental branch may add two fill lights')
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
    const contrast = summarizeHomeGpuLightContrast(visits, lightOffMode);
    const result = {
      schema: 1,
      surface: 'Home Blender 3D auxiliary light isolation',
      lightFamily: lightProbeFamily,
      benchmarkAmbient: lightProbeAmbient,
      revision: process.env.CHESS_HOME_GPU_REVISION || null,
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
    const reportName = lightProbeFamily === 'all'
      ? 'home-3d-light-probe-hardware.json'
      : `home-3d-light-probe-${lightProbeFamily}-hardware.json`;
    await writeFile(`${artifactDir}/${reportName}`,
      `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    console.log('HOME_3D_LIGHT_PROBE ' + JSON.stringify({
      sequence, lightFamily: lightProbeFamily, ambient: result.benchmarkAmbient,
      auxiliaryLightsExcluded: result.auxiliaryLightsExcluded,
      auxiliaryLightsAdded: result.auxiliaryLightsAdded,
      stability: result.stability,
      gpuMedianMs: result.gpuMedianMs,
      gpuDifferenceMs: result.gpuDifferenceMs,
      gpuContrastPct: result.gpuContrastPct,
    }));
    return;
  }
  const summary = {
    schema: 2,
    surface: 'Home Blender 3D',
    mode: requested,
    revision: process.env.CHESS_HOME_GPU_REVISION || null,
    browserVersion: browser.version(),
    viewport: { width: 1440, height: 900, dpr: 1 },
    requireTimer,
    // Only medians of physical observations, never inferred GPU ms or VRAM MB.
    medians: {
      startupMs: median(visits.map((visit) => visit.startupMs)),
      initialDrawCalls: median(visits.map((visit) => visit.initialDrawCalls)),
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
