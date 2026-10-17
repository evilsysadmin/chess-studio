import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { mockApi } from './helpers.js';

// Explicit, local-only hardware diagnostic. CI excludes this file from its
// standard Playwright matrix; no identity, passwords or raw GPU names are logged.
const requested = process.env.CHESS_HOME_GPU_MODE;
const requireTimer = process.env.CHESS_HOME_GPU_REQUIRE_TIMER === '1';
const artifactDir = '../.artifacts/home-gpu-benchmark';

function finiteNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function median(numbers) {
  const values = numbers.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!values.length) return null;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}

async function openRealHome(page) {
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
  await page.goto('./?homeGpuProfile=1', { waitUntil: 'domcontentloaded' });
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
    const num = (key) => {
      const value = d[key];
      return value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
    };
    let startupMs = null;
    try {
      const events = JSON.parse(d.homeBlenderStartup || '{}');
      startupMs = Number.isFinite(events.ready) ? events.ready : null;
    } catch { /* Retain null. */ }
    return {
      actual, vendor, software, lod: d.homeCastleLod || null,
      gpuStatus: d.homeBlenderGpuStatus || 'missing',
      gpuMs: num('homeBlenderGpuMs'),
      drawCalls: num('homeBlenderDrawCalls'),
      triangles: num('homeBlenderTriangles'),
      initialDrawCalls: num('homeBlenderFirstFrameDrawCalls'),
      initialTriangles: num('homeBlenderFirstFrameTriangles'),
      allocatedTextures: num('homeBlenderGpuTextures'),
      allocatedGeometries: num('homeBlenderGpuGeometries'),
      allocatedPrograms: num('homeBlenderGpuPrograms'),
      cpuP95Ms: num('homeBlenderCpuP95Ms'),
      rafGapP95Ms: num('homeBlenderVsyncP95Ms'),
      animatedDrawsPerSecond: num('homeBlenderDrawnFps'),
      startupMs,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
    };
  });
}

test('Home 3D physical GPU benchmark · three cold independent visits', async ({ browser, baseURL }) => {
  test.setTimeout(450_000);
  if (process.env.CHESS_E2E_LIGHTWEIGHT === '1') {
    throw new Error('CHESS_E2E_LIGHTWEIGHT=1 forces a 2D Home and cannot benchmark GPU rendering');
  }
  const visits = [];
  for (let index = 0; index < 3; index += 1) {
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
      const castle = await openRealHome(page);
      const snapshots = [];
      // Sample after the Home is ready, not the loading/compilation spike.
      // The scene throttles animation by design, so "draws/s" != display FPS.
      for (let sample = 0; sample < 4; sample += 1) {
        await page.waitForTimeout(2_000);
        snapshots.push(await readRealCanvas(castle));
      }
      const last = snapshots[snapshots.length - 1];
      const gpuSamplesMs = snapshots
        .filter((sample) => sample.gpuStatus === 'ready')
        .map((sample) => sample.gpuMs)
        .filter((value) => Number.isFinite(value));
      const row = {
        visit: index + 1,
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
      expect(row.canvasWidth * row.canvasHeight).toBeGreaterThan(0);
      expect(row.initialDrawCalls).toBeGreaterThan(0);
      expect(row.initialTriangles).toBeGreaterThan(0);
      expect(row.allocatedTextures).toBeGreaterThan(0);
      expect(row.allocatedGeometries).toBeGreaterThan(0);
      expect(row.startupMs).toBeGreaterThan(0);
      expect(row.modelRequests, 'The Home GLB must be requested, not a static fallback')
        .toBeGreaterThan(0);
      if (requested === 'hardware' && requireTimer) {
        expect(row.gpuSamplesMs.length, 'Driver did not return a valid async GPU timing query')
          .toBeGreaterThan(0);
      }
      visits.push(row);
    } finally {
      await context.close();
    }
  }
  const summary = {
    schema: 1,
    surface: 'Home Blender 3D',
    mode: requested,
    revision: process.env.CHESS_HOME_GPU_REVISION || null,
    viewport: { width: 1440, height: 900, dpr: 1 },
    requireTimer,
    // Only medians of physical observations, never inferred GPU ms or VRAM MB.
    medians: {
      startupMs: median(visits.map((visit) => visit.startupMs)),
      initialDrawCalls: median(visits.map((visit) => visit.initialDrawCalls)),
      allocatedTextures: median(visits.map((visit) => visit.allocatedTextures)),
      allocatedGeometries: median(visits.map((visit) => visit.allocatedGeometries)),
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
