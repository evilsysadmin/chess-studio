import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { homeGpuPhysicalCheckoutProvenance } from './home-gpu-revision.mjs';
import { mockApi } from './helpers.js';
import { homeBlenderDistinctGpuSamplesMs } from '../frontend/src/components/HomeBlenderPerformanceDiagnostics.js';
import { classifyHomeFlamePassContrast } from './home-blender-gpu-flame-contrast.mjs';

// Local physical GPU A/B/B/A: identical production-lit Home and GLBs; only
// transparent DoubleSide flame/candle draw-pass scheduling may differ.
// A and B are NOT visually interchangeable until the real PNGs are reviewed.
const ambientHour = { dawn: 7, day: 13, dusk: 19, night: 23 };
const ambient = process.env.CHESS_HOME_GPU_AMBIENT || 'night';
const vendor = (process.env.CHESS_HOME_GPU_EXPECT_VENDOR || '').toLowerCase();
const sequence = ['normal', 'single', 'single', 'normal'];
const directory = '../.artifacts/home-gpu-benchmark';

const median = (values) => {
  if (!values.length || values.some((v) => !Number.isFinite(v))) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const half = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[half] : (sorted[half - 1] + sorted[half]) / 2;
};

async function readCanvas(canvas) {
  return canvas.evaluate((node) => {
    const d = node.dataset;
    const gl = node.getContext('webgl2');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    let raw = '';
    try { raw = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : ''); }
    catch { /* Unknown devices are rejected. */ }
    let hash = 2166136261;
    for (const ch of raw) {
      hash ^= ch.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    const num = (name) => {
      const value = d[name];
      return value != null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
    };
    let drawPass = null;
    try { drawPass = JSON.parse(d.homeBlenderDrawPass || 'null'); } catch { /* Explicitly null. */ }
    let liveEligibility = null;
    try { liveEligibility = JSON.parse(d.homeBlenderFlamePassLiveEligibility || 'null'); }
    catch { /* Missing hardware live-fire diagnostics are not zero. */ }
    const software = d.homeBlenderSoftware === 'true'
      || /swiftshader|llvmpipe|softpipe|software/i.test(raw);
    const detectedVendor = /intel|iris/i.test(raw) ? 'intel'
      : /nvidia|geforce/i.test(raw) ? 'nvidia'
        : /radeon|\bamd\b/i.test(raw) ? 'amd' : 'unknown';
    return {
      actual: software ? 'software' : detectedVendor === 'unknown' ? 'unknown' : 'hardware',
      vendor: detectedVendor,
      rendererFingerprint: raw ? (hash >>> 0).toString(16).padStart(8, '0') : null,
      ambient: d.homeBlenderAmbient,
      lod: d.homeCastleLod,
      shadows: d.homeBlenderShadows,
      lightProbe: d.homeBlenderLightProbe,
      wallTorches: d.homeWallTorches,
      lightsDisabled: num('homeBlenderLightProbeDisabled'),
      lightsAdded: num('homeBlenderLightProbeAdded'),
      matthiasStation: d.homeMatthiasStation,
      matthiasActor: d.homeMatthiasActor,
      flamePass: d.homeBlenderFlamePass,
      fireMotion: d.homeFireMotion,
      singlePassMaterials: num('homeBlenderFlameSinglePassCount'),
      gpuStatus: d.homeBlenderGpuStatus,
      gpuSampleCount: num('homeBlenderGpuSampleCount'),
      gpuMs: num('homeBlenderGpuMs'),
      cpuP95Ms: num('homeBlenderCpuP95Ms'),
      drawPass,
      liveEligibility,
      triangles: num('homeBlenderTriangles'),
      canvasWidth: node.width,
      canvasHeight: node.height,
    };
  });
}

test('Home real GPU · transparent flame single-pass A/B/B/A and real visual PNGs', async ({ browser, baseURL }) => {
  test.setTimeout(650_000);
  expect(process.env.CHESS_HOME_GPU_MODE).toBe('hardware');
  expect(Object.hasOwn(ambientHour, ambient)).toBe(true);
  // A stale checkout or missing source SHA must fail BEFORE four expensive
  // physical cold visits. The Makefile uses $$(git rev-parse HEAD) so the shell,
  // not GNU Make, resolves the immutable 40-char commit identity.
  // A matching HEAD is not sufficient if local edits change the renderer.
  // Do not count generated/untracked PNG evidence as source-code dirtiness.
  const revision = homeGpuPhysicalCheckoutProvenance(
    process.env.CHESS_HOME_GPU_REVISION,
    execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }),
    execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=no'],
      { encoding: 'utf8' }),
  );
  // Overwrite any previous successful manifest *before* starting new visits.
  // If this run fails, old images alone do not constitute valid evidence.
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/home-3d-flame-single-pass-hardware.json`,
    JSON.stringify({ schema: 1, status: 'incomplete', revision }), 'utf8');
  const visits = [];
  const visualEvidenceHashes = {};
  for (let index = 0; index < sequence.length; index += 1) {
    const mode = sequence[index];
    const context = await browser.newContext({
      baseURL, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1,
      reducedMotion: 'no-preference', serviceWorkers: 'block',
    });
    try {
      const page = await context.newPage();
      // Both authored GLBs must resolve to the same content-addressed URL in
      // each fresh A/B context. Record only bounded hashes, never CDN URLs.
      const modelUrlFingerprints = new Set();
      page.on('request', (request) => {
        try {
          const url = new URL(request.url());
          if (!url.pathname.toLowerCase().endsWith('.glb')) return;
          const identity = `${url.origin}${url.pathname}${url.search}`;
          // A cryptographic resource-URL fingerprint avoids treating a 32-bit
          // hash collision as proof that two sessions loaded the same GLB.
          modelUrlFingerprints.add(createHash('sha256').update(identity).digest('hex'));
        } catch { /* A malformed request is not an asset identity. */ }
      });
      await page.addInitScript((hour) => {
        Object.defineProperty(Date.prototype, 'getHours', {
          configurable: true, writable: true, value() { return hour; },
        });
        Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', {
          configurable: true, get: () => 8,
        });
      }, ambientHour[ambient]);
      await mockApi(page, {
        profileSeed: {
          'matthias.onboarded': '2',
          'chess-study-home-guide-dismissed-v1': '1',
        },
      });
      // Both variants use the original production two-fill lighting and locked
      // FULL LOD. Only homeFlamePass changes between fresh browser contexts.
      await page.goto(`./?homeGpuProfile=1&homeLightProbe=pair-normal&homeFlamePass=${mode}`,
        { waitUntil: 'domcontentloaded' });
      await page.getByLabel('Usuario').fill('e2e');
      await page.getByLabel('Contraseña').fill('clave123456');
      await page.getByLabel('Contraseña').press('Enter');
      await expect(page.getByRole('region', { name: 'Modos principales', exact: true }))
        .toBeVisible({ timeout: 45_000 });
      const canvas = page.locator('.illustrated-home__castle-3d');
      await expect(canvas).toHaveAttribute('data-home-blender-runtime', 'ready', { timeout: 105_000 });
      await expect(canvas).toHaveAttribute('data-home-matthias-actor', 'ready', { timeout: 75_000 });
      await page.waitForTimeout(1_500);
      const settled = await readCanvas(canvas);
      // Fail immediately if the requested physical path is unavailable; do
      // not waste 45 seconds waiting for GPU queries on SwiftShader.
      expect(settled.actual, 'The Home canvas must use physical WebGL').toBe('hardware');
      if (vendor) expect(settled.vendor).toBe(vendor);
      expect(settled.fireMotion, 'Live authored fire is essential to this A/B').toBe('live');
      expect(settled.liveEligibility?.transparentDoubleSidedNow,
        'No alpha-enabled authored DoubleSide flames were measured')
        .toBeGreaterThan(0);
      expect(['unsupported', 'software', 'disabled', 'error', 'context-lost'])
        .not.toContain(settled.gpuStatus);
      const snapshots = [];
      const watermark = Number.isSafeInteger(settled.gpuSampleCount) ? settled.gpuSampleCount : 0;
      // The Home can deliberately throttle scene redraws on weaker hardware.
      // A fixed 4 x 2s window can yield just one completed async query after
      // discarding the ambiguous post-actor boundary. Collect independent
      // completed queries instead, with a hard wall-clock bound and no gl.finish.
      const deadline = Date.now() + 45_000;
      let freshSamples = [];
      while (Date.now() < deadline && freshSamples.length < 5) {
        await page.waitForTimeout(500);
        snapshots.push(await readCanvas(canvas));
        freshSamples = homeBlenderDistinctGpuSamplesMs(snapshots, watermark);
      }
      // The first completed result after the watermark might have been
      // submitted during actor initialization. Require FOUR further distinct
      // results rather than treating repeated reads as separate measurements.
      const gpuSamplesMs = freshSamples.slice(1);
      expect(gpuSamplesMs.length,
        'Require four new asynchronous GPU queries after the actor-boundary query')
        .toBeGreaterThanOrEqual(4);
      const row = snapshots[snapshots.length - 1];
      const visit = {
        visit: index + 1, ...row, gpuSamplesMs,
        gpuSampleWatermark: watermark,
        completedQueryObservations: freshSamples.length,
        modelUrlFingerprints: [...modelUrlFingerprints].sort(),
        gpuMedianMs: median(gpuSamplesMs),
        cpuP95MedianMs: median(snapshots.map((item) => item.cpuP95Ms)),
      };
      expect(visit.actual, 'Cannot treat SwiftShader/unknown GPU as physical hardware').toBe('hardware');
      if (vendor) expect(visit.vendor).toBe(vendor);
      expect(visit.ambient).toBe(ambient);
      expect(visit.lod).toBe('full');
      expect(visit.shadows).toBe('enabled');
      expect(visit.lightProbe).toBe('pair-normal');
      expect(visit.wallTorches).toBe('pair');
      expect(visit.lightsDisabled).toBe(4);
      expect(visit.lightsAdded).toBe(2);
      expect(visit.matthiasActor).toBe('ready');
      expect(visit.modelUrlFingerprints.length,
        'Home and Matthias GLBs must both be requested during each cold visit').toBeGreaterThanOrEqual(2);
      // A software-like/static fire path would make a draw comparison meaningless
      // even if WebGL happens to identify a real vendor. Require live fire in
      // *all* visits, including both untouched A baseline visits.
      expect(visit.fireMotion, 'All four hardware visits must animate the authored flames').toBe('live');
      expect(visit.flamePass).toBe(mode);
      // Startup slots are opaque: reject hardware comparisons without alpha.
      const live = visit.liveEligibility;
      expect(live?.materialSlots, 'Require real live authored GLB materials').toBeGreaterThan(0);
      expect(live?.transparentDoubleSidedNow,
        'Require alpha-activated DoubleSide flames on physical hardware').toBeGreaterThan(0);
      expect(live.transparentDoubleSidedNow).toBeLessThanOrEqual(live.doubleSided);
      expect(live.singlePassTransparentDoubleSidedNow,
        'Changed material count must equal live transparent DoubleSide count')
        .toBe(visit.singlePassMaterials);
      if (mode === 'normal') expect(visit.singlePassMaterials,
        'Baseline must not change material rendering').toBe(0);
      if (mode === 'single') expect(visit.singlePassMaterials,
        'Single-pass experiment must actually change eligible flame materials').toBeGreaterThan(0);
      expect(visit.gpuMedianMs).toBeGreaterThan(0);
      expect(visit.cpuP95MedianMs).toBeGreaterThanOrEqual(0);
      expect(visit.drawPass?.families?.main?.castle).toBeGreaterThan(0);
      expect(visit.drawPass.mainCalls + visit.drawPass.shadowCalls).toBe(visit.drawPass.totalCalls);
      // Avoid a comparison between different actor visibility or adaptive LOD.
      expect(snapshots.every((item) => item.lod === 'full' && item.matthiasActor === 'ready'
        && item.fireMotion === 'live' && item.flamePass === mode
        && item.liveEligibility?.transparentDoubleSidedNow === visit.liveEligibility.transparentDoubleSidedNow
        && item.liveEligibility?.singlePassTransparentDoubleSidedNow === visit.singlePassMaterials
        && item.lightsDisabled === 4 && item.lightsAdded === 2)).toBe(true);
      // A varying number of submitted meshes within the same visit makes its
      // last-frame draw count an unreliable comparator. Animated flames may
      // change pose, but cannot gain/lose draw calls during the sample window.
      expect(snapshots.every((item) => item.drawPass?.mainCalls === visit.drawPass.mainCalls
        && item.drawPass?.shadowCalls === visit.drawPass.shadowCalls
        && item.drawPass?.families?.main?.matthias === visit.drawPass.families.main.matthias
        && item.drawPass?.families?.main?.runtime === visit.drawPass.families.main.runtime),
      'Real scene draw submissions must be stable throughout each hardware visit').toBe(true);
      // Capture every A/B/B/A visit: A↔A and B↔B show natural animated
      // flame variation, so we don't attribute it to render-pass changes.
      // Playwright returns the exact bytes that are written to the PNG.
      const filename = `home-3d-flame-pass-${mode}${index >= 2 ? '-repeat' : ''}-hardware.png`;
      const filepath = `${directory}/${filename}`;
      const png = await canvas.screenshot({ path: filepath });
      visualEvidenceHashes[filename] = {
        sha256: createHash('sha256').update(png).digest('hex'),
        sourceVisit: index + 1,
        flamePass: mode,
        canvasWidth: visit.canvasWidth,
        canvasHeight: visit.canvasHeight,
      };
      visits.push(visit);
      console.log('HOME_3D_FLAME_PASS_VISIT ' + JSON.stringify({
        visit: visit.visit, flamePass: mode, gpuMedianMs: visit.gpuMedianMs,
        mainDrawCalls: visit.drawPass.mainCalls, singlePassMaterials: visit.singlePassMaterials,
      }));
    } finally {
      await context.close();
    }
  }
  expect(Object.keys(visualEvidenceHashes)).toHaveLength(4);
  const reference = visits[0];
  for (const item of visits.slice(1)) {
    for (const field of ['actual', 'vendor', 'rendererFingerprint', 'lod', 'shadows',
      'ambient', 'wallTorches', 'lightsDisabled', 'lightsAdded', 'matthiasStation',
      'matthiasActor', 'fireMotion', 'canvasWidth', 'canvasHeight',
      'modelUrlFingerprints']) {
      expect(item[field], `Nonmatching flame A/B scene field: ${field}`).toEqual(reference[field]);
    }
  }
  // `renderer.info.render.triangles` counts triangles submitted in *all*
  // passes, not immutable GLB topology. A successful single-pass change must
  // be allowed to reduce this number; compare it only within the same mode.
  for (const item of visits.slice(1)) {
    expect(item.liveEligibility.materialSlots).toBe(reference.liveEligibility.materialSlots);
    expect(item.liveEligibility.transparentDoubleSidedNow,
      'Live transparent material eligibility must match in all four visits')
      .toBe(reference.liveEligibility.transparentDoubleSidedNow);
  }
  expect(visits[3].triangles, 'Two A visits must submit the same triangles')
    .toBe(visits[0].triangles);
  expect(visits[2].triangles, 'Two B visits must submit the same triangles')
    .toBe(visits[1].triangles);
  // Only authored double-sided alpha materials may save main-pass draws.
  // Shadow, Matthias and separately spawned runtime particles are held fixed;
  // a variation in another family is not proof of an alpha-pass optimization.
  for (const item of visits.slice(1)) {
    expect(item.drawPass.shadowCalls, 'Flame pass must not change depth-pass submissions')
      .toBe(reference.drawPass.shadowCalls);
    expect(item.drawPass.families.main.matthias, 'Matthias draws must remain fixed')
      .toBe(reference.drawPass.families.main.matthias);
    expect(item.drawPass.families.main.runtime, 'Runtime particle draws must remain fixed')
      .toBe(reference.drawPass.families.main.runtime);
  }
  expect(visits[1].singlePassMaterials).toBe(visits[2].singlePassMaterials);
  const base = median([visits[0].gpuMedianMs, visits[3].gpuMedianMs]);
  const variant = median([visits[1].gpuMedianMs, visits[2].gpuMedianMs]);
  const diff = base - variant;
  const pair = [visits[0].gpuMedianMs - visits[1].gpuMedianMs,
    visits[3].gpuMedianMs - visits[2].gpuMedianMs];
  const baseDriftPct = 100 * Math.abs(visits[0].gpuMedianMs - visits[3].gpuMedianMs) / base;
  const variantDriftPct = 100 * Math.abs(visits[1].gpuMedianMs - visits[2].gpuMedianMs) / variant;
  const flags = [];
  if (baseDriftPct > 15) flags.push('normal-drift-over-15pct');
  if (variantDriftPct > 15) flags.push('single-drift-over-15pct');
  if (!((pair[0] > 0 && pair[1] > 0) || (pair[0] < 0 && pair[1] < 0)))
    flags.push('paired-direction-disagrees');
  const normalDrawCalls = median([visits[0].drawPass.mainCalls, visits[3].drawPass.mainCalls]);
  const singleDrawCalls = median([visits[1].drawPass.mainCalls, visits[2].drawPass.mainCalls]);
  const savedMainDrawCalls = normalDrawCalls - singleDrawCalls;
  // An actual reduction in GPU submissions does not establish a worthwhile
  // performance benefit. Separate the completed measurement from its bounded
  // interpretation; no verdict can approve a visual change for production.
  const interpretation = classifyHomeFlamePassContrast({
    savedMainDrawCalls,
    gpuDifferenceMs: diff,
    pairedDifferencesMs: pair,
    baseDriftMs: Math.abs(visits[0].gpuMedianMs - visits[3].gpuMedianMs),
    variantDriftMs: Math.abs(visits[1].gpuMedianMs - visits[2].gpuMedianMs),
    flags,
  });
  const result = {
    schema: 1, status: 'complete', surface: 'Home 3D flame single-pass experimental visual A/B/B/A',
    revision,
    browserVersion: browser.version(), mode: 'hardware',
    benchmarkAmbient: ambient, sequence, rendererFingerprint: reference.rendererFingerprint,
    gpuMedianMs: { normal: base, single: variant },
    gpuDifferenceMs: diff, gpuContrastPct: 100 * diff / base,
    mainDrawCalls: { normal: normalDrawCalls, single: singleDrawCalls },
    drawEvidence: {
      savedMainDrawCalls,
      reduced: savedMainDrawCalls > 0,
      gpuMedianImproved: diff > 0,
      physicalResultsStable: flags.length === 0,
      visualReviewRequired: true,
    },
    stability: { baseDriftPct, variantDriftPct, pairedDifferencesMs: pair, flags, repeatRecommended: true },
    visualEvidence: [
      'home-3d-flame-pass-normal-hardware.png',
      'home-3d-flame-pass-single-hardware.png',
      'home-3d-flame-pass-single-repeat-hardware.png',
      'home-3d-flame-pass-normal-repeat-hardware.png',
    ],
    visualEvidenceHashes,
    interpretation,
    visits,
  };
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/home-3d-flame-single-pass-hardware.json`,
    `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log('HOME_3D_FLAME_PASS_ABBA ' + JSON.stringify({
    gpuMedianMs: result.gpuMedianMs, gpuDifferenceMs: diff, gpuContrastPct: result.gpuContrastPct,
    mainDrawCalls: result.mainDrawCalls, drawEvidence: result.drawEvidence,
    stability: result.stability, interpretation: result.interpretation,
  }));
});
