import { expect, test } from '@playwright/test';
import { buttonWithVisibleText, gameStatus, login, mockApi } from './helpers.js';

const PROMOTION_START_FEN = 'k7/p5P1/8/8/8/8/8/7K w - - 0 1';
const PROMOTION_END_FEN = 'k5N1/8/p7/8/8/8/8/7K w - - 0 2';

function initialGame(id) {
  return {
    id,
    fen: PROMOTION_START_FEN,
    turn: 'w',
    humanColor: 'w',
    difficulty: 50,
    status: 'playing',
    insufficientMatingMaterial: { w: false, b: false },
    isGameOver: false,
    history: [],
    lastMove: null,
    initialFen: PROMOTION_START_FEN,
    ghostStyle: null,
  };
}

function promotedGame(id) {
  const humanMove = { from: 'g7', to: 'g8', san: 'g8=N', piece: 'p', promotion: 'n', captured: false, by: 'human' };
  const cpuMove = { from: 'a7', to: 'a6', san: 'a6', piece: 'p', captured: false, by: 'cpu' };
  return {
    id,
    fen: PROMOTION_END_FEN,
    turn: 'w',
    humanColor: 'w',
    difficulty: 50,
    status: 'playing',
    insufficientMatingMaterial: { w: false, b: false },
    isGameOver: false,
    history: [humanMove, cpuMove],
    lastMove: cpuMove,
    initialFen: PROMOTION_START_FEN,
    ghostStyle: null,
  };
}

async function installPromotionRoutes(page, requestLog) {
  const id = 'e2e-mobile-promotion';
  let current = initialGame(id);

  await page.route('http://localhost:4000/api/games', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    current = initialGame(id);
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(current) });
  });

  await page.route(`http://localhost:4000/api/games/${id}`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(current) });
  });

  await page.route('http://localhost:4000/api/games/*/move', async (route) => {
    const payload = route.request().postDataJSON?.() ?? {};
    requestLog.push(payload);
    if (payload.from !== 'g7' || payload.to !== 'g8' || payload.promotion !== 'n') {
      throw new Error(`Promoción móvil esperaba g7-g8=N, recibió ${payload.from}-${payload.to}=${payload.promotion || '?'}`);
    }
    current = promotedGame(id);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(current) });
  });
}

async function pressKeys(page, keys) {
  for (const key of keys) await page.keyboard.press(key);
}

test('Móvil · promoción 3D cabe en 360/390/430 y mantiene targets táctiles', async ({ page }) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 430, height: 820 });
  const requestLog = [];
  await mockApi(page, { requestLog: [] });
  await installPromotionRoutes(page, requestLog);
  await login(page);

  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expect(gameStatus(page)).toBeVisible();

  const board3d = page.locator('[data-board3d-war-room="true"]');
  const canvas = page.locator('.board3d-main-canvas');
  await expect(board3d).toBeVisible({ timeout: 30_000 });
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await canvas.focus();

  await pressKeys(page, ['ArrowRight', 'ArrowRight', ...Array(6).fill('ArrowUp')]);
  await expect(board3d).toHaveAttribute('data-board3d-focused', 'g7');
  await page.keyboard.press('Enter');
  await expect(board3d).toHaveAttribute('data-board3d-selected', 'g7');
  await page.keyboard.press('ArrowUp');
  await expect(board3d).toHaveAttribute('data-board3d-focused', 'g8');
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog', { name: 'Promoción de peón' });
  await expect(dialog).toBeVisible();
  await expect(page.locator('[data-promotion-modal="mobile-safe-v1"]')).toBeVisible();
  expect(requestLog).toHaveLength(0);

  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 820 });
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

    const buttons = dialog.locator('.promotion-options button');
    await expect(buttons).toHaveCount(4);
    for (let index = 0; index < 4; index += 1) {
      const buttonBox = await buttons.nth(index).boundingBox();
      expect(buttonBox).not.toBeNull();
      expect(buttonBox.width).toBeGreaterThanOrEqual(44);
      expect(buttonBox.height).toBeGreaterThanOrEqual(44);
    }
  }

  await dialog.getByRole('button', { name: 'Caballo', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => requestLog.length).toBe(1);
  expect(requestLog[0].promotion).toBe('n');
});

test('Móvil · long-press no hace Back y el Back del sistema cierra sólo el modal superior', async ({ page }) => {
  test.setTimeout(45_000);
  await page.setViewportSize({ width: 390, height: 820 });
  await mockApi(page);
  await login(page);

  await buttonWithVisibleText(page, 'Partida rápida').click();
  const dialog = page.getByRole('dialog', { name: 'Configurar partida rápida' });
  await expect(dialog).toBeVisible();
  await page.waitForFunction(() => window.history.state?.__chessStudioBackSentinel === true);

  const longPress = await dialog.evaluate((element) => {
    const event = new PointerEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      pointerType: 'touch',
    });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(longPress).toBe(true);
  await expect(dialog).toBeVisible();

  await page.evaluate(() => window.history.back());
  await expect(dialog).toBeHidden();
  await expect(buttonWithVisibleText(page, 'Partida rápida')).toBeVisible();
  await expect(page.locator('.error-boundary-screen')).toHaveCount(0);
});
