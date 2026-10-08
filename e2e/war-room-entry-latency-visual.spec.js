import { expect, test } from '@playwright/test';
import {
  activateSetupControl,
  buttonWithVisibleText,
  clickBoardMove,
  login,
  mockApi,
} from './helpers.js';

const VARIANT_KEY = 'chess-study-war-room-variant-v1';
const READY_TIMEOUT = 90_000;

function movePosts(log) {
  return log.filter((entry) => entry.method === 'POST' && /\/games\/[^/]+\/move$/.test(entry.path));
}

async function leaveGame(page) {
  await page.getByRole('button', { name: 'Salir de la partida', exact: true }).click();
  await expect(page.getByRole('heading', { name: '¿Abandonar la partida?', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar sin penalización', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Modos principales', exact: true })).toBeVisible({ timeout: 30_000 });
}

async function enterAndMeasure(page, requestLog, variant, visit) {
  await buttonWithVisibleText(page, 'Partida rápida').click();
  const start = await page.evaluate(() => performance.now());
  await activateSetupControl(page.getByRole('button', { name: 'Empezar partida', exact: true }));

  const board = page.locator('[data-board3d-war-room="true"]');
  const canvas = page.locator('.board3d-main-canvas');
  await expect(board).toBeVisible({ timeout: READY_TIMEOUT });
  await expect(canvas).toBeVisible({ timeout: READY_TIMEOUT });
  const firstFrame = await page.evaluate((t0) => performance.now() - t0, start);

  await expect(board).toHaveAttribute('data-board3d-variant', variant, { timeout: READY_TIMEOUT });
  await expect(board).toHaveAttribute('data-board3d-variant-status', 'ready', { timeout: READY_TIMEOUT });
  const shellReady = await page.evaluate((t0) => performance.now() - t0, start);

  const beforeMoves = movePosts(requestLog).length;
  await clickBoardMove(page, 'e2', 'e4');
  await expect.poll(() => movePosts(requestLog).length, { timeout: 15_000 }).toBe(beforeMoves + 1);
  const interactive = await page.evaluate((t0) => performance.now() - t0, start);

  const hansStage = await canvas.getAttribute('data-war-room-hans-stage');
  const memory = await canvas.evaluate((element) => ({
    geometries: Number(element.dataset.board3dMemoryGeometries || 0),
    textures: Number(element.dataset.board3dMemoryTextures || 0),
    programs: Number(element.dataset.board3dMemoryPrograms || 0),
  }));

  const row = {
    variant,
    visit,
    firstFrameMs: Math.round(firstFrame),
    shellReadyMs: Math.round(shellReady),
    interactiveMs: Math.round(interactive),
    hansStage,
    memory,
  };
  console.log(`War Room entry latency ${JSON.stringify(row)}`);
  expect(row.interactiveMs).toBeGreaterThanOrEqual(row.shellReadyMs);
  return row;
}

for (const variant of ['v3', 'v4']) {
  test(`War Room · ${variant} mide entrada cold y warm hasta primera jugada real`, async ({ page }) => {
    test.setTimeout(300_000);
    const requestLog = [];

    await page.addInitScript(({ key, value }) => {
      window.localStorage.setItem(key, value);
    }, { key: VARIANT_KEY, value: variant });

    await mockApi(page, {
      requestLog,
      profileSeed: {
        [VARIANT_KEY]: variant,
        'matthias.onboarded': '2',
        'chess-study-home-guide-dismissed-v1': '1',
        'chess-study-war-room-first-run-v1': 'done',
      },
    });
    await login(page);

    const cold = await enterAndMeasure(page, requestLog, variant, 'cold');
    await leaveGame(page);
    const warm = await enterAndMeasure(page, requestLog, variant, 'warm');

    // Diagnostic baseline only: do not invent latency budgets before hardware
    // and software-rendered numbers are observed. Guard only against session
    // degradation: the second visit must stay within a generous 25% + 1 s.
    expect(warm.interactiveMs).toBeLessThanOrEqual(Math.round(cold.interactiveMs * 1.25 + 1000));
  });
}
