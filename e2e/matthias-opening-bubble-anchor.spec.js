import { expect, test } from '@playwright/test';
import { buttonWithVisibleText, login, mockApi } from './helpers.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const KING_MOVED_FEN = 'rnbq1bnr/ppppkppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQ - 1 2';

async function installKingMoveReply(page, calls) {
  await page.route('http://localhost:4000/api/games/*/move', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const url = new URL(route.request().url());
    const id = url.pathname.match(/\/games\/([^/]+)\/move$/)?.[1] || '1';
    const payload = route.request().postDataJSON?.() ?? {};
    calls.push(`${payload.from || '?'}-${payload.to || '?'}`);

    const humanMove = { from: 'e2', to: 'e4', san: 'e4', piece: 'p', captured: false, by: 'human' };
    const cpuMove = { from: 'e8', to: 'e7', san: 'Ke7', piece: 'k', captured: false, by: 'cpu' };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id,
        fen: KING_MOVED_FEN,
        turn: 'w',
        humanColor: 'w',
        difficulty: 50,
        status: 'playing',
        insufficientMatingMaterial: { w: false, b: false },
        isGameOver: false,
        history: [humanMove, cpuMove],
        lastMove: cpuMove,
        initialFen: START_FEN,
        ghostStyle: null,
      }),
    });
  });
}

test('War Room · el bocadillo de apertura sigue al rey Matthias si el rey se mueve', async ({ page }) => {
  test.setTimeout(90_000);
  const moveCalls = [];

  await page.setViewportSize({ width: 1440, height: 960 });
  await page.addInitScript(() => sessionStorage.clear());
  await mockApi(page);
  await installKingMoveReply(page, moveCalls);
  await login(page);

  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();

  const board3d = page.locator('[data-board3d-war-room="true"]');
  const canvas = page.locator('.board3d-main-canvas');
  await expect(board3d).toBeVisible({ timeout: 45_000 });
  await expect(canvas).toBeVisible({ timeout: 45_000 });

  const bubble = page.getByRole('status', { name: 'Bravuconada de Matthias al iniciar la partida' });
  await expect(bubble).toBeVisible({ timeout: 10_000 });
  await expect(bubble).toHaveAttribute('data-matthias-square', 'e8');
  const before = await bubble.evaluate((element) => ({ left: element.style.left, top: element.style.top }));
  expect(before.left).not.toBe('');
  expect(before.top).not.toBe('');

  await canvas.focus();
  await expect(board3d).toHaveAttribute('data-board3d-focused', 'e1');
  await canvas.press('ArrowUp');
  await expect(board3d).toHaveAttribute('data-board3d-focused', 'e2');
  await canvas.press('Enter');
  await expect(board3d).toHaveAttribute('data-board3d-selected', 'e2');
  await canvas.press('ArrowUp');
  await canvas.press('ArrowUp');
  await expect(board3d).toHaveAttribute('data-board3d-focused', 'e4');
  await canvas.press('Enter');

  await expect.poll(() => moveCalls.length).toBe(1);
  await expect(bubble).toBeVisible();
  await expect(bubble).toHaveAttribute('data-matthias-square', 'e7');
  const after = await bubble.evaluate((element) => ({ left: element.style.left, top: element.style.top }));
  expect(after.top).not.toBe(before.top);
});
