import { expect, test } from '@playwright/test';
import { activateSetupControl, buttonWithVisibleText, login, mockApi } from './helpers.js';

const READY_TIMEOUT = 60_000;
const VARIANTS = ['classic', 'v2', 'v3', 'v4'];
const LABELS = {
  classic: 'War Room v1',
  v2: 'War Room v2',
  v3: 'War Room v3',
  v4: 'War Room v4',
};

async function installContextProbe(page) {
  await page.addInitScript(() => {
    const liveContexts = new Set();
    const nativeGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function patchedGetContext(type, ...args) {
      const context = nativeGetContext.call(this, type, ...args);
      const kind = String(type || '').toLowerCase();
      if (context && (kind === 'webgl' || kind === 'webgl2' || kind === 'experimental-webgl')) {
        liveContexts.add(context);
      }
      return context;
    };
    window.__warRoomVariantContextProbe = {
      snapshot() {
        return {
          canvases: document.querySelectorAll('.board3d-main-canvas').length,
          liveWebglContexts: [...liveContexts].filter((context) => {
            try {
              return typeof context.isContextLost !== 'function' || !context.isContextLost();
            } catch {
              return true;
            }
          }).length,
        };
      },
    };
  });
}

async function switchVariant(page, board, variant) {
  const menu = page.getByRole('button', { name: 'Más acciones de partida', exact: true });
  await expect(menu).toBeVisible({ timeout: READY_TIMEOUT });
  await menu.click();
  const item = page.getByRole('menuitemradio', { name: LABELS[variant], exact: true });
  await expect(item).toBeVisible({ timeout: 15_000 });
  await item.click();

  await expect(board).toHaveAttribute('data-board3d-variant', variant, { timeout: READY_TIMEOUT });
  await expect(board).toHaveAttribute(
    'data-board3d-variant-status',
    variant === 'classic' ? 'idle' : 'ready',
    { timeout: READY_TIMEOUT },
  );

  const canvas = page.locator('.board3d-main-canvas');
  await expect(canvas).toHaveCount(1, { timeout: READY_TIMEOUT });

  if (variant !== 'classic') {
    await expect.poll(async () => {
      const value = await canvas.getAttribute('data-war-room-hans-stage');
      return value && value !== 'loading' && value !== 'error' ? value : '';
    }, { timeout: READY_TIMEOUT, intervals: [100, 200, 400] }).not.toBe('');
  }

  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
  await page.waitForTimeout(150);
}

async function memorySnapshot(page) {
  const canvas = page.locator('.board3d-main-canvas');
  const attrs = await canvas.evaluate((element) => ({
    geometries: Number(element.dataset.board3dMemoryGeometries || 0),
    textures: Number(element.dataset.board3dMemoryTextures || 0),
    programs: Number(element.dataset.board3dMemoryPrograms || 0),
  }));
  const context = await page.evaluate(() => window.__warRoomVariantContextProbe.snapshot());
  return { ...attrs, ...context };
}

function expectBounded(current, baseline, variant, cycle) {
  const context = JSON.stringify({ variant, cycle, baseline, current });
  expect(current.canvases, `canvas leak: ${context}`).toBe(1);
  expect(current.liveWebglContexts, `WebGL context growth: ${context}`)
    .toBeLessThanOrEqual(baseline.liveWebglContexts);
  // Three keeps a few internal/shared allocations warm. Genuine shell leaks grow
  // on every revisit, so allow a tiny fixed cache margin but no per-cycle slope.
  expect(current.geometries, `geometry growth: ${context}`).toBeLessThanOrEqual(baseline.geometries + 3);
  expect(current.textures, `texture growth: ${context}`).toBeLessThanOrEqual(baseline.textures + 2);
  expect(current.programs, `shader program growth: ${context}`).toBeLessThanOrEqual(baseline.programs + 2);
}

test('War Room · rotar v1→v2→v3→v4 no acumula recursos Three/WebGL', async ({ page }) => {
  test.setTimeout(360_000);
  await installContextProbe(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApi(page);
  await login(page);

  await buttonWithVisibleText(page, 'Partida rápida').click();
  await activateSetupControl(page.getByRole('button', { name: 'Empezar partida', exact: true }));

  const board = page.locator('[data-board3d-war-room="true"]');
  await expect(board).toBeVisible({ timeout: READY_TIMEOUT });
  await expect(page.locator('.board3d-main-canvas')).toHaveCount(1, { timeout: READY_TIMEOUT });

  // First pass warms shared Three shader/program caches for every shell.
  // A baseline captured before other variants mount would mistake legitimate
  // cross-variant shader compilation for a leak when we revisit v1.
  for (const variant of VARIANTS) {
    await switchVariant(page, board, variant);
    console.log(`War Room variant soak warm-up ${variant} ${JSON.stringify(await memorySnapshot(page))}`);
  }

  const baselines = new Map();
  for (const variant of VARIANTS) {
    await switchVariant(page, board, variant);
    const snapshot = await memorySnapshot(page);
    baselines.set(variant, snapshot);
    console.log(`War Room variant soak baseline ${variant} ${JSON.stringify(snapshot)}`);
  }

  for (let cycle = 1; cycle <= 2; cycle += 1) {
    for (const variant of VARIANTS) {
      await switchVariant(page, board, variant);
      const snapshot = await memorySnapshot(page);
      expectBounded(snapshot, baselines.get(variant), variant, cycle);
      console.log(`War Room variant soak cycle ${cycle} ${variant} ${JSON.stringify(snapshot)}`);
    }
  }
});
