import { expect, test } from '@playwright/test';
import { buttonWithVisibleText, gameStatus, login, mockApi } from './helpers.js';
import { navigateWarRoomKeyboard } from './war-room-board-input.js';

const OPENING_END_FEN = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2';

async function expectNoTransient2DSelection(page) {
  const board = page.locator('.board-grid').first();
  await expect(board.locator('.square.selected')).toHaveCount(0);
  await expect(board.locator('.square.legal-move, .square.legal-capture')).toHaveCount(0);
}

async function expectAuthoritativeOpening2D(page) {
  const board = page.locator('.board-grid').first();
  await expect(page.getByRole('button', { name: /^Casilla e4, peón blanco/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Casilla e5, peón negro/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Casilla e2,/i })).not.toHaveAttribute('aria-label', /peón blanco/i);
  await expect(page.getByRole('button', { name: /^Casilla e7,/i })).not.toHaveAttribute('aria-label', /peón negro/i);
  await expectNoTransient2DSelection(page);
  await expect(board.locator('.square.last-move')).toHaveCount(2);
  await expect(board.locator('.square[aria-label^="Casilla e7,"]')).toHaveClass(/last-move/);
  await expect(board.locator('.square[aria-label^="Casilla e5,"]')).toHaveClass(/last-move/);
}

async function switchTo3D(page) {
  await page.getByRole('button', { name: 'Cambiar apariencia y piezas del tablero', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Ajustes' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radio', { name: /3D$/ }).click();
  const close = dialog.getByRole('button', { name: 'Cerrar', exact: true });
  await expect(close).toBeVisible();
  await close.evaluate((element) => element.click());
  await expect(dialog).toBeHidden({ timeout: 15_000 });

  const board3d = page.locator('[data-board3d-war-room="true"]');
  const canvas = page.locator('.board3d-main-canvas');
  await expect(board3d).toBeVisible({ timeout: 30_000 });
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await expect(board3d).toHaveAttribute('data-board3d-turn', 'human');
  await expect(board3d).toHaveAttribute('data-board3d-selected', '');
  await expect(board3d).toHaveAttribute('data-board3d-legal-target-count', '0');
  return { board3d, canvas };
}

async function switchTo2D(page) {
  const appearance = page.locator('.board3d-customize');
  await expect(appearance).toBeVisible({ timeout: 30_000 });
  await appearance.click();
  const dialog = page.getByRole('dialog', { name: 'Ajustes' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radio', { name: /2D$/ }).click();
  const close = dialog.getByRole('button', { name: 'Cerrar', exact: true });
  await expect(close).toBeVisible();
  await close.evaluate((element) => element.click());
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await expect(page.locator('.board-grid').first()).toBeVisible({ timeout: 30_000 });
}

test('offline→online durante /move pendiente no revierte el movimiento optimista ni duplica la mutación', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });

  const requestLog = [];
  await mockApi(page, { requestLog });

  let movePosts = 0;
  let reconnectGets = 0;
  let authoritativeGame = null;
  let releaseMove;
  const moveGate = new Promise((resolve) => { releaseMove = resolve; });

  // Este gate necesita una foto de backend válida y estable. El mock compartido
  // conserva escenarios históricos con `captured` no booleano/ausente, que el
  // contrato moderno de gamePayload rechaza correctamente. Aquí simulamos la
  // autoridad real de Mongo sin relajar el validador de producción.
  await page.route('http://localhost:4000/api/games/*/move', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const url = new URL(route.request().url());
    const id = url.pathname.match(/\/games\/([^/]+)\/move$/)?.[1] || 'e2e-game-1';
    const payload = route.request().postDataJSON?.() ?? {};
    movePosts += 1;
    requestLog.push({ method: 'POST', path: url.pathname });
    await moveGate;

    if (payload.from !== 'e2' || payload.to !== 'e4') {
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ detail: `Reconnect E2E esperaba e2-e4, recibió ${payload.from || '?'}-${payload.to || '?'}` }),
      });
    }

    const humanMove = { from: 'e2', to: 'e4', san: 'e4', piece: 'p', captured: false, by: 'human' };
    const cpuMove = { from: 'e7', to: 'e5', san: 'e5', piece: 'p', captured: false, by: 'cpu' };
    authoritativeGame = {
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
    };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(authoritativeGame) });
  });

  await page.route('http://localhost:4000/api/games/*', async (route) => {
    if (route.request().method() !== 'GET' || route.request().url().endsWith('/move')) return route.fallback();
    reconnectGets += 1;
    if (!authoritativeGame) return route.fallback();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(authoritativeGame) });
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
  await expect(e2).toHaveAttribute('aria-label', /peón blanco/i);
  await e2.click();
  await e4.click();

  await expect.poll(() => movePosts, { timeout: 5_000 }).toBe(1);
  await expect(page.getByRole('button', { name: /^Casilla e4, peón blanco/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Casilla e2,/i })).not.toHaveAttribute('aria-label', /peón blanco/i);
  await expectNoTransient2DSelection(page);

  await page.evaluate(() => {
    window.dispatchEvent(new Event('offline'));
    window.dispatchEvent(new Event('online'));
  });

  // Mientras /move sigue en SAVING, el reconnect debe quedar aplazado. Consultar
  // Mongo ahora podría devolver la foto anterior y hacer rollback del movimiento optimista.
  await page.waitForTimeout(250);
  expect(reconnectGets).toBe(0);
  await expect(page.getByRole('button', { name: /^Casilla e4, peón blanco/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Casilla e2,/i })).not.toHaveAttribute('aria-label', /peón blanco/i);
  await expectNoTransient2DSelection(page);
  expect(movePosts).toBe(1);

  releaseMove();

  // Al terminar la mutación pendiente sí se permite reconciliar con la foto ya
  // autoritativa. El reconnect no puede borrar e4 ni generar otro POST.
  await expect.poll(() => reconnectGets, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
  await expectAuthoritativeOpening2D(page);
  await expect(gameStatus(page)).toBeVisible();
  expect(movePosts).toBe(1);

  // La foto autoritativa es 1.e4 ...e5. Al entrar en 3D el caballo g1 debe ver
  // e2 libre además de f3/h3: 3 destinos. Si Three/React hubiera rehidratado la
  // posición inicial por separado, sólo veríamos 2. Además no debe reaparecer
  // selección ni targets de la mutación que acaba de terminar.
  const { board3d, canvas } = await switchTo3D(page);
  await navigateWarRoomKeyboard(canvas, board3d, 'g1');
  await canvas.press('Enter');
  await expect(board3d).toHaveAttribute('data-board3d-selected', 'g1');
  await expect(board3d).toHaveAttribute('data-board3d-legal-target-count', '3');
  await canvas.press('Enter');
  await expect(board3d).toHaveAttribute('data-board3d-selected', '');
  await expect(board3d).toHaveAttribute('data-board3d-legal-target-count', '0');

  // Cierra 2D→3D→2D: FEN, lastMove y ausencia de highlights transitorios deben
  // seguir siendo exactamente la misma foto después del cambio de renderer.
  await switchTo2D(page);
  await expectAuthoritativeOpening2D(page);
  expect(movePosts).toBe(1);
  expect(requestLog.filter((entry) => entry.method === 'POST' && /\/api\/games\/[^/]+\/move$/.test(entry.path))).toHaveLength(1);
  await expect(page.locator('.error-boundary-screen')).toHaveCount(0);
});
