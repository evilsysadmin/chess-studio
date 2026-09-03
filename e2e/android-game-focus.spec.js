import { devices, expect, test } from '@playwright/test';
import { buttonWithVisibleText, clickBoardMove, login, mockApi } from './helpers.js';

test.use({ ...devices['Pixel 5'] });

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const CAPTURE_READY_FEN = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2';
const CAPTURE_END_FEN = 'rnbqkb1r/ppp1pppp/5n2/3P4/8/8/PPPP1PPP/RNBQKBNR w KQkq - 1 3';

function movePosts(requestLog) {
  return requestLog.filter((entry) => entry.method === 'POST' && /\/games\/[^/]+\/move$/.test(entry.path));
}

async function startQuickGame(page, requestLog, mockOptions = {}) {
  await mockApi(page, { requestLog, ...mockOptions });
  await login(page);
  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();

  // Mobile follows the same product contract as desktop: a fresh quick game
  // lands directly in War Room. Waiting for the actual renderer avoids coupling
  // readiness to a status strip that compact layouts are allowed to fold away.
  await expect(page.locator('[data-board3d-war-room="true"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.board3d-main-canvas')).toBeVisible({ timeout: 30_000 });
}

async function installFocusCaptureRoute(page, requestLog) {
  await page.route('http://localhost:4000/api/games/*/move', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const url = new URL(route.request().url());
    const id = url.pathname.match(/\/games\/([^/]+)\/move$/)?.[1] || 'e2e-game-1';
    const payload = route.request().postDataJSON?.() ?? {};
    requestLog.push({
      method: 'POST',
      path: url.pathname,
      idempotencyKey: route.request().headers()['idempotency-key'] || null,
    });

    if (payload.from === 'e2' && payload.to === 'e4') {
      const humanMove = { from: 'e2', to: 'e4', san: 'e4', piece: 'p', captured: false, by: 'human' };
      const cpuMove = { from: 'd7', to: 'd5', san: 'd5', piece: 'p', captured: false, by: 'cpu' };
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id,
          fen: CAPTURE_READY_FEN,
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
    }

    if (payload.from === 'e4' && payload.to === 'd5') {
      const firstHuman = { from: 'e2', to: 'e4', san: 'e4', piece: 'p', captured: false, by: 'human' };
      const firstCpu = { from: 'd7', to: 'd5', san: 'd5', piece: 'p', captured: false, by: 'cpu' };
      const capture = { from: 'e4', to: 'd5', san: 'exd5', piece: 'p', captured: true, by: 'human' };
      const cpuMove = { from: 'g8', to: 'f6', san: 'Nf6', piece: 'n', captured: false, by: 'cpu' };
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id,
          fen: CAPTURE_END_FEN,
          turn: 'w',
          humanColor: 'w',
          difficulty: 50,
          status: 'playing',
          insufficientMatingMaterial: { w: false, b: false },
          isGameOver: false,
          history: [firstHuman, firstCpu, capture, cpuMove],
          lastMove: cpuMove,
          initialFen: START_FEN,
          ghostStyle: null,
        }),
      });
    }

    return route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ detail: `Focus E2E no simula ${payload.from || '?'}-${payload.to || '?'}` }),
    });
  });
}

async function waitForOpeningTranscript(page) {
  await expect.poll(async () => page.evaluate(() => {
    try {
      const raw = localStorage.getItem('chess-study-active-game-chat');
      const parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed?.messages)
        && parsed.messages.some((message) => message?.by === 'cpu' && String(message?.text || '').trim());
    } catch {
      return false;
    }
  }), {
    timeout: 10_000,
    message: 'La pulla inicial debe quedar en el transcript antes de activar Focus',
  }).toBe(true);
}

test('Android · Focus deja sólo el tablero 3D, sigue siendo jugable y puede salir', async ({ page }) => {
  const requestLog = [];
  await startQuickGame(page, requestLog);

  const focus = page.getByRole('button', { name: 'Focus', exact: true });
  await expect(focus).toBeVisible();
  await focus.click();

  const layout = page.locator('.game-layout');
  const board3d = page.locator('[data-board3d-war-room="true"]');
  const canvas = page.locator('.board3d-main-canvas');
  await expect(layout).toHaveAttribute('data-mobile-focus', 'true');
  await expect(page.locator('body')).toHaveClass(/game-mobile-focus-active/);
  await expect(page.locator('.app-shell-board-game > .masthead')).toBeHidden();
  await expect(page.locator('.global-music-dock')).toBeHidden();
  await expect(page.locator('.game-player-rail')).toHaveCount(0);
  await expect(page.locator('.game-side-column')).toHaveCount(0);
  await expect(page.locator('.game-command-deck')).toHaveCount(0);

  const exit = page.getByRole('button', { name: 'Salir del modo Focus', exact: true });
  await expect(exit).toBeVisible();
  await expect(board3d).toBeVisible();
  await expect(canvas).toBeVisible();

  // Board3D starts keyboard focus at e1 for White. The same selection/move
  // state used by touch remains live in Focus; e1→e2 selects the pawn, then
  // e2→e4 sends exactly one real move.
  await canvas.focus();
  await canvas.press('ArrowUp');
  await expect(board3d).toHaveAttribute('data-board3d-focused', 'e2');
  await canvas.press('Enter');
  await expect(board3d).toHaveAttribute('data-board3d-selected', 'e2');
  await expect.poll(async () => Number(await board3d.getAttribute('data-board3d-legal-target-count'))).toBeGreaterThan(0);
  await canvas.press('ArrowUp');
  await canvas.press('ArrowUp');
  await expect(board3d).toHaveAttribute('data-board3d-focused', 'e4');
  await canvas.press('Enter');
  await expect.poll(() => movePosts(requestLog).length).toBe(1);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  await exit.click();
  await expect(layout).toHaveAttribute('data-mobile-focus', 'false');
  await expect(page.locator('body')).not.toHaveClass(/game-mobile-focus-active/);
  await expect(page.locator('.app-shell-board-game > .masthead')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Focus', exact: true })).toBeVisible();
});

test('Android · Focus convierte reacciones nuevas de Matthias en bocadillos temporales', async ({ page }) => {
  test.setTimeout(60_000);
  const requestLog = [];
  await mockApi(page, { requestLog });
  await installFocusCaptureRoute(page, requestLog);

  await login(page);
  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expect(page.locator('[data-board3d-war-room="true"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.board3d-main-canvas')).toBeVisible({ timeout: 30_000 });

  // La apertura AI es una fuente independiente de comentarios. La dejamos
  // terminar ANTES de Focus para que enterFocus marque ese mensaje como visto;
  // así no puede robarle el bocadillo al evento que vamos a provocar después.
  await waitForOpeningTranscript(page);

  const focus = page.getByRole('button', { name: 'Focus', exact: true });
  await expect(focus).toBeVisible();
  await focus.click();
  const layout = page.locator('.game-layout');
  const bubble = page.getByRole('status', { name: 'Comentario de Matthias en Focus' });
  await expect(layout).toHaveAttribute('data-mobile-focus', 'true');
  await expect(bubble).toHaveCount(0);

  // e4 …d5 prepara una captura totalmente legal desde la posición inicial.
  // exd5 nace ya dentro de Focus y alimenta el mismo historial real que usa
  // Matthias para sus reacciones; nada de mensajes inyectados directamente en UI.
  await clickBoardMove(page, 'e2', 'e4');
  await expect.poll(() => movePosts(requestLog).length).toBe(1);
  await expect(page.locator('[data-board3d-war-room="true"]')).toHaveAttribute('data-board3d-selected', '');

  await clickBoardMove(page, 'e4', 'd5');
  await expect.poll(() => movePosts(requestLog).length).toBe(2);

  await expect(bubble).toBeVisible({ timeout: 6_000 });
  await expect(bubble).toContainText('MATTHIAS');
  await expect(bubble.locator('p')).not.toHaveText('');
  await expect(page.locator('.game-side-column')).toHaveCount(0);

  // El bocadillo es un popup, no un panel permanente.
  await expect(bubble).toBeHidden({ timeout: 7_000 });
  await expect(page.getByRole('button', { name: 'Salir del modo Focus', exact: true })).toBeVisible();
});
