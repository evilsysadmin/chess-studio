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
  // These tests run on SwiftShader. Never interpret its timer as hardware GPU.
  expect(gpuStatus).not.toBe('ready');
});
