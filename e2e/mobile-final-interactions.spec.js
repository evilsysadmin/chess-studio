import { expect, test } from '@playwright/test';
import { buttonWithVisibleText, gameStatus, login, mockApi } from './helpers.js';

const PROMOTION_START_FEN = 'k7/p5P1/8/8/8/8/8/7K w - - 0 1';
const PROMOTION_END_FEN = 'k5N1/8/p7/8/8/8/8/7K w - - 0 2';
const OPENING_END_FEN = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2';

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

test('Home · la experiencia canónica no cambia con el viewport', async ({ page }) => {
  await mockApi(page);
  await login(page);

  for (const width of [390, 430, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.locator('.menu.menu-illustrated')).toBeVisible();
    await expect(page.locator('.illustrated-home')).toBeVisible();
    await expect(page.locator('.menu.home-friendly')).toHaveCount(0);
    await expect(page.locator('details.home-learning-more')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  }
});

test('Móvil · Partida de práctica abre su modal fijo dentro del viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await login(page);

  const toolsToggle = page.getByRole('button', { name: /Más modos y herramientas/ });
  await expect(toolsToggle).toHaveAttribute('aria-expanded', 'false');
  await toolsToggle.click();
  await expect(toolsToggle).toHaveAttribute('aria-expanded', 'true');

  const tools = page.getByRole('navigation', { name: 'Más modos y herramientas' });
  const practice = tools.getByRole('button', { name: 'Partida de práctica', exact: true });
  await expect(practice).toHaveCount(1);
  await expect(practice).toBeVisible();
  await practice.click();

  const dialog = page.getByRole('dialog', { name: 'Configurar partida de práctica', exact: true });
  await expect(dialog).toBeVisible();

  const backdrop = dialog.locator('..');
  const contract = await backdrop.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return {
      position: getComputedStyle(node).position,
      top: rect.top,
      left: rect.left,
      right: rect.right,
      bottom: rect.bottom,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  });

  expect(contract.position).toBe('fixed');
  expect(contract.top).toBeLessThanOrEqual(1);
  expect(contract.left).toBeLessThanOrEqual(1);
  expect(contract.right).toBeGreaterThanOrEqual(contract.viewportWidth - 1);
  expect(contract.bottom).toBeGreaterThanOrEqual(contract.viewportHeight - 1);

  const dialogBox = await dialog.boundingBox();
  expect(dialogBox).not.toBeNull();
  expect(dialogBox.y).toBeGreaterThanOrEqual(0);
  expect(dialogBox.y + dialogBox.height).toBeLessThanOrEqual(contract.viewportHeight + 1);
});

test('Móvil · doble activación durante una jugada pendiente conserva un único optimistic move', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });

  await mockApi(page);

  let movePosts = 0;
  let releaseMove;
  const moveGate = new Promise((resolve) => { releaseMove = resolve; });
  await page.route('http://localhost:4000/api/games/*/move', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    movePosts += 1;
    const payload = route.request().postDataJSON?.() ?? {};
    if (payload.from !== 'e2' || payload.to !== 'e4') {
      throw new Error(`Jugada móvil pendiente esperaba e2-e4, recibió ${payload.from}-${payload.to}`);
    }
    await moveGate;

    const pathParts = new URL(route.request().url()).pathname.split('/');
    const id = pathParts[pathParts.length - 2];
    const humanMove = { from: 'e2', to: 'e4', san: 'e4', piece: 'p', by: 'human' };
    const cpuMove = { from: 'e7', to: 'e5', san: 'e5', piece: 'p', by: 'cpu' };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id,
        fen: OPENING_END_FEN,
        turn: 'w',
        humanColor: 'w',
        difficulty: 50,
        status: 'playing',
        insufficientMatingMaterial: { w: false, b: false },
        isGameOver: false,
        history: [humanMove, cpuMove],
        lastMove: cpuMove,
        initialFen: null,
        ghostStyle: null,
      }),
    });
  });

  await login(page);
  await page.evaluate(() => {
    localStorage.setItem('chess-study-board-renderer', '2d-explicit-v1');
    window.dispatchEvent(new Event('chess-study-user-preferences-changed'));
  });

  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expect(gameStatus(page)).toBeVisible();

  const e2 = page.locator('.square[aria-label^="Casilla e2,"]');
  const e4 = page.locator('.square[aria-label^="Casilla e4,"]');
  await expect(e2).toBeVisible();
  await expect(e4).toBeVisible();
  await expect(e2).toHaveAttribute('aria-label', /peón blanco/i);

  await e2.click();
  await e4.evaluate((element) => {
    element.click();
    element.click();
  });

  await expect.poll(() => movePosts, { timeout: 5_000 }).toBe(1);
  await page.waitForTimeout(150);
  expect(movePosts).toBe(1);

  await expect(page.getByRole('button', { name: /^Casilla e4, peón blanco/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Casilla e2,/i })).not.toHaveAttribute('aria-label', /peón blanco/i);
  await expect(page.getByRole('button', { name: /^Casilla e7, peón negro/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Casilla e5, peón negro/i })).toHaveCount(0);

  releaseMove();

  await expect(page.getByRole('button', { name: /^Casilla e4, peón blanco/i })).toBeVisible({ timeout: 10_000 });
  await expect(gameStatus(page)).toBeVisible({ timeout: 10_000 });
  expect(movePosts).toBe(1);
  await expect(page.locator('.error-boundary-screen')).toHaveCount(0);
});
