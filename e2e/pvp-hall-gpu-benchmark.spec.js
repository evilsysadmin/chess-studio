import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

// Local-only. Mock only authoritative PvP APIs; keep actual Hall GLB and
// renderer. Never capture credentials or unsanitized renderer strings.
const requested = process.env.CHESS_PVP_GPU_MODE;

async function openHall(page) {
  await mockApi(page);
  await page.route('**/api/pvp/lobby', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      roster: [{ username: 'e2e', rating: 1050, tier: 'Intermedio', isSelf: true }],
      challenges: [], activeMatch: null, messages: [], pollAfterMs: 3000,
    }),
  }));
  await login(page);
  const entry = page.getByRole('button', { name: 'Abrir Sala de Duelos 1 contra 1' });
  if (!await entry.isVisible().catch(() => false)) {
    const more = page.getByRole('button', { name: /^Más(?: formas de jugar)?$/ });
    await expect(more).toBeVisible();
    if ((await more.getAttribute('aria-expanded')) !== 'true') await more.click();
  }
  await expect(entry).toBeVisible();
  return entry;
}

async function installTimingProbe(page) {
  await page.evaluate(() => {
    const sample = { start: performance.now(), ready: null, tasks: [], supported: true };
    try {
      const observer = new PerformanceObserver((list) => {
        for (const task of list.getEntries()) {
          if (sample.tasks.length < 24)
            sample.tasks.push({ at: task.startTime, ms: task.duration });
        }
      });
      observer.observe({ type: 'longtask', buffered: false });
    } catch { sample.supported = false; }
    const observer = new MutationObserver(() => {
      if (sample.ready === null &&
          document.querySelector('[data-pvp-duel-hall-3d="ready"]')) {
        sample.ready = performance.now();
      }
    });
    observer.observe(document.body, {
      subtree: true, attributes: true, attributeFilter: ['data-pvp-duel-hall-3d'],
    });
    window.__pvpHallGpuSample = sample;
  });
}

for (let visit = 1; visit <= 3; visit += 1) {
  test('Hall GLB GPU diagnostic visit ' + visit, async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: 1440, height: 900 });
    const entry = await openHall(page);
    await installTimingProbe(page);
    let modelRequests = 0;
    page.on('request', (request) => {
      try {
        if (new URL(request.url()).pathname.toLowerCase().endsWith('.glb'))
          modelRequests++;
      } catch { /* No raw request URL is logged. */ }
    });
    await entry.click();
    await expect(page.getByRole('dialog', { name: 'Duelo 1 contra 1 · War Room' })).toBeVisible();
    const scene = page.locator('[data-pvp-duel-hall-3d]');
    await expect(scene).toHaveAttribute('data-pvp-duel-hall-3d', 'ready', { timeout: 60000 });
    await page.waitForTimeout(1500);
    const row = await scene.evaluate((element) => {
      const sample = window.__pvpHallGpuSample;
      const canvas = element.querySelector('canvas');
      // Inspect the EXISTING product context, never create a benchmark canvas.
      const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
      const ext = gl?.getExtension('WEBGL_debug_renderer_info');
      const renderer = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '') : '';
      const software = /swiftshader|llvmpipe|softpipe|software/i.test(renderer);
      // ANGLE alone does not indicate actual GPU hardware.
      const physical = /nvidia|radeon|amd|intel|apple|adreno|mali|powervr|iris/i.test(renderer);
      const actual = !ext || !renderer ? 'unknown'
        : software ? 'software' : physical ? 'hardware' : 'unknown';
      const max = (entries) => Math.round(Math.max(0, ...entries.map((t) => t.ms)));
      return {
        actual,
        readyMs: sample.ready === null ? null : Math.round(sample.ready - sample.start),
        maxLongTaskMs: max(sample.tasks),
        maxAfterReadyMs: max(sample.tasks.filter((t) => t.at >= sample.ready)),
        longTasks: sample.tasks.length,
        supported: sample.supported,
        canvasPixels: canvas ? canvas.width * canvas.height : 0,
      };
    });
    console.log('PVP_HALL_GPU_BENCH ' + JSON.stringify({ requested, visit, ...row, modelRequests }));
    expect(row.actual, 'The REAL WebGL device must match; flags are not proof').toBe(requested);
    expect(row.readyMs).not.toBeNull();
    expect(row.canvasPixels).toBeGreaterThan(0);
    expect(modelRequests, 'The real Hall GLB must be requested').toBeGreaterThan(0);
    expect(row.supported).toBe(true);
  });
}
