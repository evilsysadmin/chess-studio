import { expect, test } from '@playwright/test';
import { mockApi } from './helpers.js';

// CI can prove that a REAL Three.js WebGL canvas publishes internally
// consistent counts. SwiftShader cannot establish physical GPU milliseconds.
test.use({
  viewport: { width: 1440, height: 900 },
  reducedMotion: 'no-preference',
  launchOptions: {
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  },
});

const validCounts = (split) => {
  if (!split || !Number.isSafeInteger(split.totalCalls) || split.totalCalls <= 0
      || !Number.isSafeInteger(split.shadowCalls) || split.shadowCalls < 0
      || !Number.isSafeInteger(split.mainCalls) || split.mainCalls <= 0
      || !Number.isSafeInteger(split.shadowPasses) || split.shadowPasses < 0
      || split.shadowCalls + split.mainCalls !== split.totalCalls
      || !split.families) return false;
  for (const phase of ['main', 'shadow']) {
    const group = split.families[phase];
    if (!group || !['castle', 'matthias', 'runtime'].every((family) =>
      Number.isSafeInteger(group[family]) && group[family] >= 0)) return false;
    if (group.castle + group.matthias + group.runtime !== split[`${phase}Calls`]) return false;
    const hotspots = split.hotspots?.[phase];
    if (!hotspots || !Number.isSafeInteger(hotspots.uniqueObjects)
        || !Number.isSafeInteger(hotspots.otherCalls) || hotspots.otherCalls < 0
        || !Array.isArray(hotspots.top) || hotspots.top.length > 12
        || hotspots.uniqueObjects < hotspots.top.length) return false;
    const shown = hotspots.top.reduce((sum, item) => {
      if (!['castle', 'matthias', 'runtime'].includes(item.family)
          || typeof item.name !== 'string' || !item.name
          || !Number.isSafeInteger(item.calls) || item.calls <= 0) return NaN;
      return sum + item.calls;
    }, 0);
    if (shown + hotspots.otherCalls !== split[`${phase}Calls`]) return false;
  }
  return true;
};

test('Home 3D · profiler attributes real WebGL draws to castle, Matthias and depth/main passes', async ({ page }) => {
  test.setTimeout(180_000);
  // Hosted CI runners report too few logical cores for the full authored
  // hall. This overrides only the perceived CPU tier, not the WebGL backend.
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', {
      configurable: true, get: () => 8,
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
  await page.getByLabel('Contraseña').fill('clave123456');
  await page.getByLabel('Contraseña').press('Enter');
  await expect(page.getByRole('region', { name: 'Modos principales', exact: true }))
    .toBeVisible({ timeout: 45_000 });
  const canvas = page.locator('.illustrated-home__castle-3d');
  await expect(canvas).toHaveClass(/is-ready/, { timeout: 105_000 });
  await expect(canvas).toHaveAttribute('data-home-castle-compositor', 'blender-runtime');
  await expect(canvas).toHaveAttribute('data-home-blender-runtime', 'ready');
  await expect(canvas).toHaveAttribute('data-home-matthias-actor', 'ready', { timeout: 75_000 });

  await expect.poll(() => canvas.evaluate((node) => {
    const parse = (key) => {
      try { return JSON.parse(node.dataset[key] || 'null'); } catch { return null; }
    };
    return { first: parse('homeBlenderFirstFrameDrawPass'), latest: parse('homeBlenderDrawPass') };
  }), { timeout: 45_000, message: 'Real Home WebGL renderer must produce an opt-in pass census' })
    .toMatchObject({
      first: { totalCalls: expect.any(Number), mainCalls: expect.any(Number) },
      latest: { totalCalls: expect.any(Number), mainCalls: expect.any(Number) },
    });

  // Wait for the actor mount to trigger at least one complete attributed
  // frame. Never use mesh inventory to invent per-family draw submissions.
  await expect.poll(() => canvas.evaluate((node) => {
    try {
      const split = JSON.parse(node.dataset.homeBlenderDrawPass || 'null');
      const valid = (s) => s && Number.isSafeInteger(s.totalCalls)
        && s.totalCalls > 0 && s.mainCalls + s.shadowCalls === s.totalCalls
        && ['main', 'shadow'].every((phase) => {
          const x = s.families?.[phase];
          return x && ['castle', 'matthias', 'runtime'].every((key) =>
            Number.isSafeInteger(x[key]) && x[key] >= 0)
            && x.castle + x.matthias + x.runtime === s[`${phase}Calls`];
        });
      return Boolean(valid(split) && split.families.main.castle > 0
        && split.families.main.matthias > 0);
    } catch { return false; }
  }), { timeout: 45_000, message: 'Castle and Matthias must have measured direct GPU draw submissions' })
    .toBe(true);

  const { first, latest, gpuStatus } = await canvas.evaluate((node) => {
    const parse = (name) => JSON.parse(node.dataset[name] || 'null');
    return {
      first: parse('homeBlenderFirstFrameDrawPass'),
      latest: parse('homeBlenderDrawPass'),
      gpuStatus: node.dataset.homeBlenderGpuStatus,
    };
  });
  expect(validCounts(first), 'First frame count must be an actual, complete Three census').toBe(true);
  expect(validCounts(latest), 'Latest frame count must be an actual, complete Three census').toBe(true);
  // SwiftShader intentionally disables live fire. The GLB material side
  // census is still available before animation starts; it must be real data,
  // not a fabricated benchmark or an assertion of GPU draw savings.
  const eligibility = await canvas.evaluate((node) => {
    try { return JSON.parse(node.dataset.homeBlenderFlamePassEligibility || 'null'); }
    catch { return null; }
  });
  expect(eligibility?.materialSlots).toBeGreaterThan(0);
  expect(eligibility.doubleSided + eligibility.frontSided + eligibility.otherSided)
    .toBe(eligibility.materialSlots);
  expect(eligibility.transparentNow).toBeLessThanOrEqual(eligibility.materialSlots);
  expect(eligibility.transparentDoubleSidedNow).toBeLessThanOrEqual(eligibility.doubleSided);
  expect(eligibility.singlePassTransparentDoubleSidedNow)
    .toBeLessThanOrEqual(eligibility.transparentDoubleSidedNow);
  // A second census is only allowed after real live-fire alpha activation.
  // SwiftShader intentionally never reaches that path; it cannot claim that
  // the 73 initial DoubleSide slots became 73 transparent draw candidates.
  expect(await canvas.getAttribute('data-home-fire-motion')).toBe('off-software');
  expect(await canvas.getAttribute('data-home-blender-flame-pass-live-eligibility')).toBe(null);
  // Bounded non-identifying counts in the smoke log tell us whether the
  // single-pass experiment has any DoubleSide flame candidates at all.
  console.log('HOME_3D_FLAME_SIDE_CENSUS ' + JSON.stringify(eligibility));
  // These tests run on SwiftShader. Never interpret its timer as hardware GPU.
  expect(gpuStatus).not.toBe('ready');

  // A system preference change must stop/restart the existing runtime rather
  // than retaining the motion value captured at mount or reloading the GLB.
  const originalCanvas = await canvas.elementHandle();
  const startup = await canvas.getAttribute('data-home-blender-startup');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(canvas).toHaveAttribute('data-home-fire-motion', 'reduced');
  await expect(canvas).toHaveAttribute('data-home-klaus-motion', 'reduced');
  await expect(canvas).toHaveAttribute('data-home-blender-runtime', 'ready');
  expect(await canvas.evaluate((node, original) => node === original, originalCanvas)).toBe(true);
  expect(await canvas.getAttribute('data-home-blender-startup')).toBe(startup);
  // Observe real renderer submissions through the opt-in profiler after the
  // one final preference paint has settled. A quiet reduced-motion hall sleeps.
  await page.waitForTimeout(250);
  const paints = await canvas.evaluate((node) => new Promise((resolve) => {
    let count = 0;
    const observer = new MutationObserver((records) => {
      count += records.filter(({ attributeName }) => attributeName === 'data-home-blender-draw-pass').length;
    });
    observer.observe(node, { attributes: true, attributeFilter: ['data-home-blender-draw-pass'] });
    setTimeout(() => { observer.disconnect(); resolve(count); }, 500);
  }));
  expect(paints).toBe(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(canvas).toHaveAttribute('data-home-fire-motion', 'off-software');
  expect(await canvas.evaluate((node, original) => node === original, originalCanvas)).toBe(true);
  expect(await canvas.getAttribute('data-home-blender-startup')).toBe(startup);
  await originalCanvas.dispose();
});


test('Home 3D · opt-in flame single pass reduces REAL Three draw calls, not scene content', async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  async function census(mode) {
    const context = await browser.newContext({
      baseURL, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1,
      reducedMotion: 'no-preference', serviceWorkers: 'block',
    });
    try {
      const page = await context.newPage();
      await page.addInitScript(() => {
        Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', {
          configurable: true, get: () => 8,
        });
        Object.defineProperty(Date.prototype, 'getHours', {
          configurable: true, writable: true, value() { return 23; },
        });
      });
      await mockApi(page, { profileSeed: {
        'matthias.onboarded': '2', 'chess-study-home-guide-dismissed-v1': '1',
      } });
      await page.goto(`./?homeGpuProfile=1&homeLightProbe=pair-normal&homeFlamePass=${mode}`,
        { waitUntil: 'domcontentloaded' });
      await page.getByLabel('Usuario').fill('e2e');
      await page.getByLabel('Contraseña').fill('clave123456');
      await page.getByLabel('Contraseña').press('Enter');
      const canvas = page.locator('.illustrated-home__castle-3d');
      await expect(canvas).toHaveAttribute('data-home-blender-runtime', 'ready', { timeout: 105_000 });
      await expect(canvas).toHaveAttribute('data-home-matthias-actor', 'ready', { timeout: 75_000 });
      await expect.poll(async () => canvas.evaluate((node) => {
        let split = null;
        try { split = JSON.parse(node.dataset.homeBlenderDrawPass || 'null'); }
        catch { return false; }
        // Hosted Chromium uses SwiftShader: Home deliberately disables fire
        // animation and never prepares transparent flame materials there.
        // Test safe/no-op behavior on software, actual draw savings only on
        // a physical renderer with live fire (local hardware probe).
        const software = node.dataset.homeBlenderSoftware === 'true';
        const flameReady = software
          ? node.dataset.homeFireMotion === 'off-software'
          : node.dataset.homeFireMotion === 'live'
            && (node.dataset.homeBlenderFlamePass !== 'single'
              || Number(node.dataset.homeBlenderFlameSinglePassCount) > 0);
        return Boolean(validCountsInPage(split) && split.families.main.castle > 0
          && split.families.main.matthias > 0 && flameReady);
        function validCountsInPage(s) {
          return s && s.totalCalls > 0 && s.mainCalls + s.shadowCalls === s.totalCalls
            && s.families && ['main', 'shadow'].every((phase) => {
              const group = s.families[phase];
              return group && group.castle + group.matthias + group.runtime === s[phase + 'Calls'];
            });
        }
      }), { timeout: 45_000, message: 'Real WebGL must render eligible double-sided flame materials' })
        .toBe(true);
      const snapshot = await canvas.evaluate((node) => ({
        mode: node.dataset.homeBlenderFlamePass,
        affectedMaterials: Number(node.dataset.homeBlenderFlameSinglePassCount),
        software: node.dataset.homeBlenderSoftware === 'true',
        fireMotion: node.dataset.homeFireMotion,
        station: node.dataset.homeMatthiasStation,
        lightProbe: node.dataset.homeBlenderLightProbe,
        wall: node.dataset.homeWallTorches,
        lod: node.dataset.homeCastleLod,
        drawPass: JSON.parse(node.dataset.homeBlenderDrawPass),
      }));
      expect(validCounts(snapshot.drawPass)).toBe(true);
      expect(snapshot.mode).toBe(mode);
      expect(snapshot.lightProbe).toBe('pair-normal');
      expect(snapshot.wall).toBe('pair');
      expect(snapshot.lod).toBe('full');
      return snapshot;
    } finally {
      await context.close();
    }
  }
  const normal = await census('normal');
  const single = await census('single');
  expect(normal.affectedMaterials, 'A condition must have unmodified flames').toBe(0);
  if (normal.software || single.software) {
    // Do not turn on fire just to force a software CI draw-count win:
    // physical GPU A/B/B/A and visual PNG review are the acceptance gate.
    expect(normal.software).toBe(true);
    expect(single.software).toBe(true);
    expect(normal.fireMotion).toBe('off-software');
    expect(single.fireMotion).toBe('off-software');
    expect(single.affectedMaterials, 'Software Home must not silently enable fire').toBe(0);
    expect(validCounts(normal.drawPass)).toBe(true);
    expect(validCounts(single.drawPass)).toBe(true);
    return;
  }
  expect(single.fireMotion).toBe('live');
  expect(single.affectedMaterials, 'B must actually enable single-pass on eligible materials')
    .toBeGreaterThan(0);
  expect(single.station).toBe(normal.station);
  expect(single.drawPass.families.main.matthias).toBe(normal.drawPass.families.main.matthias);
  expect(single.drawPass.families.main.runtime).toBe(normal.drawPass.families.main.runtime);
  expect(single.drawPass.mainCalls, 'B must submit fewer real WebGL draws than A')
    .toBeLessThan(normal.drawPass.mainCalls);
});
