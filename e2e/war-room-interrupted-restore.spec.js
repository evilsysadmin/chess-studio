import { expect, test } from '@playwright/test';
import { buttonWithVisibleText, clickBoardMove, login, mockApi } from './helpers.js';
import { navigateWarRoomKeyboard } from './war-room-board-input.js';

const WAR_ROOM_READY_TIMEOUT = 45_000;
const MOVE_RESPONSE_TIMEOUT = 45_000;
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_OPENING_FEN = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2';
const AFTER_CAPTURE_FEN = 'rnbqkb1r/ppp1pppp/5n2/3P4/8/8/PPPP1PPP/RNBQKBNR w KQkq - 1 3';

function movePosts(requestLog) {
  return requestLog.filter((entry) => entry.method === 'POST' && /\/games\/[^/]+\/move$/.test(entry.path));
}

function gamePayload(id, stage) {
  const firstHuman = { from: 'e2', to: 'e4', san: 'e4', piece: 'p', captured: false, by: 'human' };
  const firstCpu = { from: 'd7', to: 'd5', san: 'd5', piece: 'p', captured: false, by: 'cpu' };

  if (stage === 1) {
    return {
      id,
      fen: AFTER_OPENING_FEN,
      turn: 'w',
      humanColor: 'w',
      difficulty: 50,
      status: 'playing',
      insufficientMatingMaterial: { w: false, b: false },
      isGameOver: false,
      history: [firstHuman, firstCpu],
      lastMove: firstCpu,
      initialFen: START_FEN,
      ghostStyle: null,
    };
  }

  const capture = { from: 'e4', to: 'd5', san: 'exd5', piece: 'p', captured: true, by: 'human' };
  const secondCpu = { from: 'g8', to: 'f6', san: 'Nf6', piece: 'n', captured: false, by: 'cpu' };
  return {
    id,
    fen: AFTER_CAPTURE_FEN,
    turn: 'w',
    humanColor: 'w',
    difficulty: 50,
    status: 'playing',
    insufficientMatingMaterial: { w: false, b: false },
    isGameOver: false,
    history: [firstHuman, firstCpu, capture, secondCpu],
    lastMove: secondCpu,
    initialFen: START_FEN,
    ghostStyle: null,
  };
}

async function installRestoreAuthorityRoutes(page, requestLog) {
  const games = new Map();

  // El restore de sesión vuelve a pedir /games/{id}. Esta ruta imita la autoridad
  // de Mongo para las posiciones que este spec ha creado mediante /move; el resto
  // de endpoints sigue perteneciendo al mock compartido.
  await page.route('http://localhost:4000/api/games/*', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const url = new URL(route.request().url());
    const id = url.pathname.match(/\/games\/([^/]+)$/)?.[1] || null;
    const current = id ? games.get(id) : null;
    if (!current) return route.fallback();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(current) });
  });

  await page.route('http://localhost:4000/api/games/*/move', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const url = new URL(route.request().url());
    const id = url.pathname.match(/\/games\/([^/]+)\/move$/)?.[1] || 'e2e-game-1';
    const payload = route.request().postDataJSON?.() ?? {};
    requestLog.push({ method: 'POST', path: url.pathname });

    let stage = 0;
    if (payload.from === 'e2' && payload.to === 'e4') stage = 1;
    if (payload.from === 'e4' && payload.to === 'd5') stage = 2;
    if (!stage) {
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ detail: `War Room restore E2E no simula ${payload.from || '?'}-${payload.to || '?'}` }),
      });
    }

    const game = gamePayload(id, stage);
    games.set(id, game);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(game) });
  });
}

async function waitForCommittedMoveFrame(page, responsePromise) {
  const response = await responsePromise;
  expect(response.status()).toBe(200);

  // Dos frames dejan que la promesa fetch actualice React y que Board3D arme la
  // transición, pero siguen muy por debajo de la duración física del movimiento.
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
}

async function expectCleanWarRoom(page) {
  const board3d = page.locator('[data-board3d-war-room="true"]');
  const canvas = page.locator('.board3d-main-canvas');
  await expect(board3d).toBeVisible({ timeout: WAR_ROOM_READY_TIMEOUT });
  await expect(canvas).toHaveCount(1, { timeout: WAR_ROOM_READY_TIMEOUT });
  await expect(board3d).toHaveAttribute('data-board3d-turn', 'human');
  await expect(board3d).toHaveAttribute('data-board3d-selected', '');
  await expect(board3d).toHaveAttribute('data-board3d-legal-target-count', '0');
  await expect(page.locator('.error-boundary-screen')).toHaveCount(0);
  return { board3d, canvas };
}

async function switchTo2D(page) {
  await page.getByRole('button', { name: 'Apariencia', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Ajustes' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radio', { name: /2D$/ }).click();
  const close = dialog.getByRole('button', { name: 'Cerrar', exact: true });
  await expect(close).toBeVisible();
  await close.evaluate((element) => element.click());
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await expect(page.locator('.board-grid').first()).toBeVisible({ timeout: WAR_ROOM_READY_TIMEOUT });
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
  return expectCleanWarRoom(page);
}

async function expectCaptureSnapshot2D(page) {
  const board = page.locator('.board-grid').first();
  await expect(board).toBeVisible({ timeout: WAR_ROOM_READY_TIMEOUT });
  await expect(page.getByRole('button', { name: /^Casilla d5, peón blanco/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Casilla f6, caballo negro/i })).toBeVisible();
  await expect(board.locator('.square.selected')).toHaveCount(0);
  await expect(board.locator('.square.legal-move, .square.legal-capture')).toHaveCount(0);
  await expect(board.locator('.square.last-move')).toHaveCount(2);
  await expect(board.locator('.square[aria-label^="Casilla g8,"]')).toHaveClass(/last-move/);
  await expect(board.locator('.square[aria-label^="Casilla f6,"]')).toHaveClass(/last-move/);
}

test('War Room · F5 durante movimiento y captura restaura una escena limpia y jugable', async ({ page }) => {
  test.setTimeout(180_000);
  const requestLog = [];

  await page.setViewportSize({ width: 1440, height: 960 });
  await mockApi(page, { requestLog });
  await installRestoreAuthorityRoutes(page, requestLog);
  await login(page);

  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expectCleanWarRoom(page);

  const openingResponse = page.waitForResponse((response) => (
    response.request().method() === 'POST'
    && /\/games\/[^/]+\/move$/.test(new URL(response.url()).pathname)
  ), { timeout: MOVE_RESPONSE_TIMEOUT });
  await clickBoardMove(page, 'e2', 'e4');
  await expect.poll(() => movePosts(requestLog).length, { timeout: 5_000 }).toBe(1);
  await waitForCommittedMoveFrame(page, openingResponse);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectCleanWarRoom(page);

  const captureResponse = page.waitForResponse((response) => (
    response.request().method() === 'POST'
    && /\/games\/[^/]+\/move$/.test(new URL(response.url()).pathname)
  ), { timeout: MOVE_RESPONSE_TIMEOUT });
  await clickBoardMove(page, 'e4', 'd5');
  await expect.poll(() => movePosts(requestLog).length, { timeout: 5_000 }).toBe(2);
  await waitForCommittedMoveFrame(page, captureResponse);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectCleanWarRoom(page);

  // 2D actúa como sonda accesible del estado común restaurado. Si quedara una
  // escena 3D visualmente limpia pero lógicamente vieja, estas casillas fallan.
  await switchTo2D(page);
  await expectCaptureSnapshot2D(page);
  await expect(page.locator('.board3d-main-canvas')).toHaveCount(0);

  // Volver a 3D no puede rehidratar una foto anterior ni conservar selección o
  // destinos fantasma. d5 sólo existe en el FEN restaurado y tiene un único
  // avance legal (d6); la posición inicial ni siquiera contiene una pieza allí.
  const { board3d, canvas } = await switchTo3D(page);
  await navigateWarRoomKeyboard(canvas, board3d, 'd5');
  await canvas.press('Enter');
  await expect(board3d).toHaveAttribute('data-board3d-selected', 'd5');
  await expect(board3d).toHaveAttribute('data-board3d-legal-target-count', '1');
  await canvas.press('Enter');
  await expect(board3d).toHaveAttribute('data-board3d-selected', '');
  await expect(board3d).toHaveAttribute('data-board3d-legal-target-count', '0');

  // Cierra el round-trip 3D→2D→3D→2D y acredita que lastMove también pertenece
  // al snapshot común, no a residuos privados de un renderer.
  await switchTo2D(page);
  await expectCaptureSnapshot2D(page);
  await expect(page.locator('.error-boundary-screen')).toHaveCount(0);
  expect(movePosts(requestLog)).toHaveLength(2);
});
