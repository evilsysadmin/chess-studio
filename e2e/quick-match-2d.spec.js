import { expect, test } from '@playwright/test';
import { buttonWithVisibleText, clickBoardMove, login, mockApi } from './helpers.js';

const DEVICE_BOARD_RENDERER_KEY = 'chess-study-device-board-renderer-v1';
const MATE_END_FEN = '7k/6Q1/5K2/8/8/8/8/8 b - - 1 1';

async function launchQuickMatch2D(page) {
  await buttonWithVisibleText(page, 'Partida rápida').click();
  const dialog = page.getByRole('dialog', { name: 'Configurar partida rápida' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Jugar en 2D, directo al tablero', exact: true }).click();
}

async function expectLightweight2D(page) {
  await expect(page.getByRole('group', { name: /Tablero de ajedrez/ })).toBeVisible();
  await expect(page.locator('[data-board3d-war-room="true"]')).toHaveCount(0);
  await expect(page.locator('.game-layout-3d')).toHaveCount(0);
}

async function installContractValidMateRoute(page) {
  await page.route('http://localhost:4000/api/games/*/move', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const payload = route.request().postDataJSON?.() ?? {};
    if (payload.from !== 'g6' || payload.to !== 'g7') return route.fallback();

    const id = new URL(route.request().url()).pathname.match(/\/games\/([^/]+)\/move$/)?.[1] || 'e2e-game-1';
    const move = { from: 'g6', to: 'g7', san: 'Qg7#', piece: 'q', captured: false, by: 'human' };
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id,
        fen: MATE_END_FEN,
        turn: 'b',
        humanColor: 'w',
        difficulty: 50,
        status: 'checkmate',
        insufficientMatingMaterial: { w: false, b: false },
        isGameOver: true,
        history: [move],
        lastMove: move,
        initialFen: '7k/8/5KQ1/8/8/8/8/8 w - - 0 1',
        ghostStyle: null,
      }),
    });
  });
}

test('Partida rápida · 2D entra directo al tablero ligero', async ({ page }) => {
  await mockApi(page);
  await login(page);
  await launchQuickMatch2D(page);

  await expectLightweight2D(page);
});

test('Partida rápida · 2D persiste tras F5 en el mismo dispositivo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await mockApi(page);
  await login(page);
  await launchQuickMatch2D(page);
  await expectLightweight2D(page);

  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), DEVICE_BOARD_RENDERER_KEY)).toBe('2d');

  await page.reload({ waitUntil: 'domcontentloaded' });

  await expectLightweight2D(page);
  await expect(page.getByText('Restaurando partida en curso…', { exact: true })).toHaveCount(0);
  await expect(buttonWithVisibleText(page, 'Partida rápida')).toHaveCount(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), DEVICE_BOARD_RENDERER_KEY)).toBe('2d');
});

test('Partida rápida · 2D llega a mate y postpartida sin montar War Room', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await mockApi(page, { gameScenario: 'mate' });
  await installContractValidMateRoute(page);
  await login(page);
  await launchQuickMatch2D(page);
  await expectLightweight2D(page);

  await clickBoardMove(page, 'g6', 'g7');

  const endgame = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Jaque mate', exact: true }) });
  await expect(endgame).toBeVisible();
  await expect(endgame.getByText('¡Ganaste la partida!', { exact: true })).toBeVisible();
  await expect(page.locator('[data-board3d-war-room="true"]')).toHaveCount(0);
  await expect(page.locator('.game-layout-3d')).toHaveCount(0);
  await expect(page.locator('.error-boundary-screen')).toHaveCount(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), DEVICE_BOARD_RENDERER_KEY)).toBe('2d');
});

test('Partida rápida · un dispositivo limpio conserva War Room como camino principal', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApi(page);
  await login(page);

  expect(await page.evaluate((key) => localStorage.getItem(key), DEVICE_BOARD_RENDERER_KEY)).toBeNull();
  await buttonWithVisibleText(page, 'Partida rápida').click();
  const dialog = page.getByRole('dialog', { name: 'Configurar partida rápida' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Empezar partida', exact: true }).click();

  await expect(page.locator('[data-board3d-war-room="true"]')).toBeVisible();
  await expect(page.locator('.game-layout-3d')).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), DEVICE_BOARD_RENDERER_KEY)).toBeNull();
});

test('Partida rápida · 2D prioriza tablero y controles a 360/390/430 px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await mockApi(page);
  await login(page);
  await launchQuickMatch2D(page);

  const board = page.locator('.game-screen .board-grid');
  await expect(board).toBeVisible();
  await expect(page.locator('.game-layout-3d')).toHaveCount(0);

  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 780 });

    const geometry = await page.evaluate(() => {
      const boardNode = document.querySelector('.game-screen .board-grid');
      const sideNode = document.querySelector('.game-screen .game-side-column');
      const actionsNode = document.querySelector('.game-screen .game-controls-actions');
      const rect = boardNode?.getBoundingClientRect();
      const columns = actionsNode ? getComputedStyle(actionsNode).gridTemplateColumns.split(/\s+/).filter(Boolean) : [];
      return {
        viewportWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        boardWidth: rect?.width || 0,
        boardLeft: rect?.left || 0,
        boardRight: rect?.right || 0,
        sideDisplay: sideNode ? getComputedStyle(sideNode).display : null,
        actionColumns: columns.length,
      };
    });

    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1);
    expect(geometry.boardWidth).toBeGreaterThanOrEqual(width - 48);
    expect(geometry.boardLeft).toBeGreaterThanOrEqual(0);
    expect(geometry.boardRight).toBeLessThanOrEqual(width + 1);
    expect(geometry.sideDisplay).toBe('none');
    expect(geometry.actionColumns).toBe(2);
  }
});