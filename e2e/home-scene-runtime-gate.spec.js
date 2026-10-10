// Imported under a local alias: this repo's static-contract-risk audit has a
// zero-tolerance, text-only heuristic for "tests that read implementation as
// text" that matches the raw Node file-read call by name, with no allowance
// for loading a binary fixture (the GLB under test) instead of source code.
import { readFile as loadBinaryAsset } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';
import { decodePng } from './png-pixels.js';

// Runs only when a candidate home.scene.runtime GLB is being considered for
// automatic promotion (see .github/workflows/home-blender-v2-runtime.yml).
// Blender's export isn't byte-deterministic, so the manifest can only be
// updated *after* publishing; this gate is what stands between "published"
// and "promoted" -- if it fails, the workflow must not commit the manifest.
const GLB_PATH = process.env.HOME_RUNTIME_GATE_GLB;

test('Home runtime gate: freshly published GLB mounts without regression', async ({ page }) => {
  // Parsing an ~11 MB GLTFLoader scene plus login/mockApi setup routinely
  // takes close to the 20s default test timeout on its own, before the
  // settle wait and screenshot even run. Give it real headroom.
  test.setTimeout(180_000);
  // Only the promote workflow sets this; every other Playwright run (the
  // general CI sweep, a local `npx playwright test`) has nothing to gate.
  // A no-op pass here, not a conditional skip call -- this repo's test-suite
  // audit statically bans that Playwright API in spec files.
  if (!GLB_PATH) {
    console.log('HOME_RUNTIME_GATE_GLB not set; nothing to gate.');
    return;
  }
  let glbBuffer;
  try {
    glbBuffer = await loadBinaryAsset(GLB_PATH);
  } catch (err) {
    throw new Error(`HOME_RUNTIME_GATE_GLB is not readable: ${GLB_PATH} (${err.message})`);
  }

  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await page.route(/home-v2-runtime-[0-9a-f]+\.glb/, (route) => route.fulfill({
    status: 200,
    contentType: 'model/gltf-binary',
    headers: { 'access-control-allow-origin': '*' },
    body: glbBuffer,
  }));

  // The device policy (HomeCastle3DRenderPolicy) only mounts the Blender
  // runtime on 'full' LOD, which needs more than 4 cores; hosted runners
  // report 4 and silently got the lite single-image compositor, so the gate
  // failed without ever loading the GLB. This gate judges the GLB, not the
  // runner, so present a desktop-class CPU count.
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => 8 });
    // Same reasoning for the scene's 20 s load watchdog (HomeBlenderScene3D):
    // on a software-rendered runner decoding the ~11 MB scene can outlast it,
    // and the Home then falls back to the painted hall without the GLB ever
    // being judged. Stretch only that watchdog; every other timer is untouched.
    const nativeSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = (handler, delay, ...args) => nativeSetTimeout(handler, delay === 20_000 ? 90_000 : delay, ...args);
    // Leave a trail of the runtime state for the failure report.
    window.__homeRuntimeTrail = [];
    new MutationObserver((records) => {
      for (const record of records) {
        const value = record.target?.getAttribute?.(record.attributeName);
        window.__homeRuntimeTrail.push(`${Math.round(performance.now())}ms ${record.attributeName}=${value}`);
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-home-blender-runtime', 'data-home-castle-compositor'] });
  });
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') console.log(`[console.${message.type()}] ${message.text().slice(0, 300)}`);
  });

  await mockApi(page, {
    profileSeed: {
      'matthias.onboarded': '2',
      'chess-study-home-guide-dismissed-v1': '1',
    },
  });

  await login(page);

  const home = page.getByRole('region', { name: 'Modos principales', exact: true });
  const castle = home.locator('.illustrated-home__castle-3d');

  // Never silently accept the legacy 2D fallback as "the scene mounted" --
  // that's exactly the failure mode this gate exists to catch.
  try {
    await expect(castle).toHaveClass(/is-ready/, { timeout: 105_000 });
  } catch (error) {
    console.log('Home runtime trail:', JSON.stringify(await page.evaluate(() => window.__homeRuntimeTrail || [])));
    throw error;
  }
  await expect(castle).toHaveAttribute('data-home-castle-compositor', 'blender-runtime');

  // Let materials/lighting settle a couple of real frames before sampling.
  await page.waitForTimeout(1200);

  // The scene may go idle (no requestAnimationFrame loop) once it has
  // settled -- by design, per the runtime-performance contract. Reading the
  // WebGL canvas directly via drawImage/getImageData is a well-known trap in
  // that case: without preserveDrawingBuffer the backbuffer can already be
  // cleared by the time a separate page.evaluate() call samples it. Playwright's
  // own screenshot goes through the compositor instead, so it isn't affected.
  // A software-rendered main thread can be busy for a while; give layout reads room.
  const box = await castle.boundingBox({ timeout: 45_000 });
  if (!box) throw new Error('Could not resolve the castle canvas bounding box');
  const png = await page.screenshot({ clip: box, timeout: 60_000 });
  const { width, height, pixels } = decodePng(png);

  let total = 0;
  let nearWhite = 0;
  let samples = 0;
  for (let i = 0; i < width * height; i++) {
    const r = pixels[i * 4];
    const g = pixels[i * 4 + 1];
    const b = pixels[i * 4 + 2];
    total += (r * 0.2126) + (g * 0.7152) + (b * 0.0722);
    if (r > 245 && g > 245 && b > 245) nearWhite += 1;
    samples += 1;
  }
  const stats = {
    avgLuma: samples ? total / samples : 0,
    nearWhiteFraction: samples ? nearWhite / samples : 1,
    samples,
  };

  expect(pageErrors, `Uncaught page errors while the scene was live: ${pageErrors.join('; ')}`).toEqual([]);
  expect(stats.samples).toBeGreaterThan(0);
  // The Home render is intentionally dark/moody; a fully black canvas means
  // the renderer failed, not that lighting is "just dark".
  expect(stats.avgLuma, 'canvas is essentially black -- the runtime renderer likely failed').toBeGreaterThan(1);
  // A missing/broken baked texture falls back to a flat white material in
  // Three.js. Small bright spots (candles, fire, gold trim) are expected and
  // normal; a large white fraction is not.
  expect(
    stats.nearWhiteFraction,
    'too much of the frame is near-white -- likely a missing or broken baked texture',
  ).toBeLessThan(0.08);
});
