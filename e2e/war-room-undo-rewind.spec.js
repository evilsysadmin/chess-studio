import { expect, test } from '@playwright/test';
import { gameStatus, login, mockApi } from './helpers.js';
import { navigateWarRoomKeyboard } from './war-room-board-input.js';

const WAR_ROOM_READY_TIMEOUT = 45_000;
const ACTIVE_GAME_SESSION_KEY = 'chess-study-active-game-session-v1';
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_OPENING_FEN = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2';

function initialGame(id) {
  return {
    id,
    fen: START_FEN,
    turn: 'w',
    humanColor: 'w',
    difficulty: 50,
    status: 'playing',
    insufficientMatingMaterial: { w: false, b: false },
    isGameOver: false,
    history: [],
    lastMove: null,
    initialFen: START_FEN,
    ghostStyle: null,
  };
}

function openingGame(id) {
  const humanMove = { from: 'e2', to: 'e4', san: 'e4', piece: 'p', captured: false, by: 'human' };
  const cpuMove = { from: 'e7', to: 'e5', san: 'e5', piece: 'p', captured: false, by: 'cpu' };
  return {
    id,
    fen: AFTER_OPENING_FEN,
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
  };
}

async function installUndoRoutes(page, requestLog) {
  const id = 'e2e-war-room-undo';
  let currentGame = initialGame(id);

  await page.route('http://localhost:4000/api/games', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const url = new URL(route.request().url());
    requestLog.push({ method: 'POST', path: url.pathname });
    currentGame = initialGame(id);
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(currentGame) });
  });

  await page.route(`http://localhost:4000/api/games/${id}`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(currentGame) });
  });

  await page.route(`http://localhost:4000/api/games/${id}/move`, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const payload = route.request().postDataJSON?.() ?? {};
    if (payload.from !== 'e2' || payload.to !== 'e4') {
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ detail: `War Room undo E2E esperaba e2-e4, recibió ${payload.from || '?'}-${payload.to || '?'}` }),
      });
    }
    requestLog.push({ method: 'POST', path: new URL(route.request().url()).pathname });
    currentGame = openingGame(id);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(currentGame) });
  });

  await page.route(`http://localhost:4000/api/games/${id}/undo`, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    requestLog.push({ method: 'POST', path: new URL(route.request().url()).pathname });
    currentGame = initialGame(id);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(currentGame) });
  });
}

function movePosts(requestLog) {
  return requestLog.filter((entry) => entry.method === 'POST' && /\/games\/[^/]+\/move$/.test(entry.path));
}

function undoPosts(requestLog) {
  return requestLog.filter((entry) => entry.method === 'POST' && /\/games\/[^/]+\/undo$/.test(entry.path));
}

async function startPracticeFromCanonicalHome(page) {
  const toolsToggle = page.getByRole('button', { name: /Más modos y herramientas/ });
  await expect(toolsToggle).toBeVisible();
  if (await toolsToggle.getAttribute('aria-expanded') !== 'true') await toolsToggle.click();
  await expect(toolsToggle).toHaveAttribute('aria-expanded', 'true');

  const tools = page.getByRole('navigation', { name: 'Más modos y herramientas' });
  const practice = tools.getByRole('button', { name: 'Partida de práctica', exact: true });
  await expect(practice).toBeVisible();
  await practice.click();

  const dialog = page.getByRole('dialog', { name: 'Configurar partida de práctica', exact: true });
  await expect(dialog).toBeVisible();
  const start = dialog.getByRole('button', { name: 'Empezar práctica', exact: true });
  await expect(start).toBeEnabled();
  await start.click();
  await expect(gameStatus(page)).toBeVisible();
}

async function setRendererViaAppearance(page, renderer) {
  const warRoom = page.locator('[data-board3d-war-room="true"]');
  let button;
  if (await warRoom.count()) {
    const utilityMenu = page.getByRole('button', { name: 'Más acciones de partida', exact: true });
    await expect(utilityMenu).toBeVisible({ timeout: WAR_ROOM_READY_TIMEOUT });
    await utilityMenu.click();
    button = page.getByRole('menuitem', { name: 'Apariencia', exact: true });
  } else {
    button = page.getByRole('button', { name: 'Cambiar apariencia y piezas del tablero', exact: true });
  }

  await expect(button).toBeVisible({ timeout: WAR_ROOM_READY_TIMEOUT });
  try {
    await button.click({ timeout: 12_000 });
  } catch {
    await button.evaluate((element) => element.click());
  }

  const dialog = page.getByRole('dialog', { name: 'Ajustes' });
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await dialog.getByRole('radio', { name: new RegExp(`${renderer}$`) }).click();
  const close = dialog.getByRole('button', { name: 'Cerrar', exact: true });
  await expect(close).toBeVisible();
  await close.evaluate((element) => element.click());
  await expect(dialog).toBeHidden({ timeout: 15_000 });
}

async function expectWarRoomReady(page) {
  const board3d = page.locator('[data-board3d-war-room="true"]');
  const canvas = page.locator('.board3d-main-canvas');
  await expect(board3d).toBeVisible({ timeout: WAR_ROOM_READY_TIMEOUT });
  await expect(canvas).toBeVisible({ timeout: WAR_ROOM_READY_TIMEOUT });
  await expect(board3d).toHaveAttribute('data-board3d-turn', 'human');
  await expect(board3d).toHaveAttribute('data-board3d-selected', '');
  await expect(board3d).toHaveAttribute('data-board3d-legal-target-count', '0');
  await expect(page.locator('.error-boundary-screen')).toHaveCount(0);
  return { board3d, canvas };
}

async function expectKnightMobility(canvas, board3d, targetCount) {
  await navigateWarRoomKeyboard(canvas, board3d, 'g1');
  await canvas.press('Enter');
  await expect(board3d).toHaveAttribute('data-board3d-selected', 'g1');
  await expect(board3d).toHaveAttribute('data-board3d-legal-target-count', String(targetCount));
  await canvas.press('Enter');
  await expect(board3d).toHaveAttribute('data-board3d-selected', '');
  await expect(board3d).toHaveAttribute('data-board3d-legal-target-count', '0');
}

async function expectPersistedFen(page, fen) {
  await expect.poll(async () => page.evaluate(({ key, expectedFen }) => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || 'null');
      return saved?.gameSnapshot?.fen === expectedFen;
    } catch {
      return false;
    }
  }, { key: ACTIVE_GAME_SESSION_KEY, expectedFen: fen }), {
    timeout: 5_000,
    intervals: [25, 50, 75],
  }).toBe(true);
}

test('War Room · deshacer en 3D rebobina FEN, lastMove y highlights y sobrevive F5', async ({ page }) => {
  test.setTimeout(150_000);
  const requestLog = [];

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 960 });
  await mockApi(page, { requestLog });
  await installUndoRoutes(page, requestLog);
  await login(page);
  await startPracticeFromCanonicalHome(page);
  await setRendererViaAppearance(page, '3D');

  let { board3d, canvas } = await expectWarRoomReady(page);

  await navigateWarRoomKeyboard(canvas, board3d, 'e2');
  await canvas.press('Enter');
  await expect(board3d).toHaveAttribute('data-board3d-selected', 'e2');
  await navigateWarRoomKeyboard(canvas, board3d, 'e4');
  await canvas.press('Enter');

  await expect.poll(() => movePosts(requestLog).length, { timeout: 5_000 }).toBe(1);
  await expectPersistedFen(page, AFTER_OPENING_FEN);
  await expectWarRoomReady(page);

  // Tras 1.e4 ...e5, e2 queda libre y el caballo g1 gana su tercer destino (e2).
  // Esta comprobación prueba el FEN que alimenta al renderer, no una etiqueta auxiliar.
  await expectKnightMobility(canvas, board3d, 3);

  const undo = page.getByRole('button', { name: 'Deshacer jugada', exact: true });
  await expect(undo).toBeVisible();
  await expect(undo).toBeEnabled();
  await undo.click();

  await expect.poll(() => undoPosts(requestLog).length, { timeout: 5_000 }).toBe(1);
  await expectPersistedFen(page, START_FEN);
  ({ board3d, canvas } = await expectWarRoomReady(page));

  // El rewind debe devolver e2 a su sitio inmediatamente: g1 vuelve a tener sólo
  // f3/h3. Si Three conservase la foto posterior al undo, seguirían apareciendo 3.
  await expectKnightMobility(canvas, board3d, 2);
  expect(movePosts(requestLog)).toHaveLength(1);
  expect(undoPosts(requestLog)).toHaveLength(1);

  // Rehidrata desde el snapshot ya rebobinado: no puede reaparecer la posición
  // posterior, lastMove ni selección/targets de la jugada deshecha.
  await page.reload({ waitUntil: 'domcontentloaded' });
  ({ board3d, canvas } = await expectWarRoomReady(page));
  await expectKnightMobility(canvas, board3d, 2);

  await setRendererViaAppearance(page, '2D');
  const board2d = page.locator('.board-grid').first();
  await expect(board2d).toBeVisible({ timeout: WAR_ROOM_READY_TIMEOUT });
  await expect(page.getByRole('button', { name: /^Casilla e2, peón blanco/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Casilla e7, peón negro/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Casilla e4, vacía/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Casilla e5, vacía/i })).toBeVisible();
  await expect(board2d.locator('.square.last-move')).toHaveCount(0);
  await expect(board2d.locator('.square.selected')).toHaveCount(0);
  await expect(board2d.locator('.square.legal-move, .square.legal-capture')).toHaveCount(0);
  await expect(gameStatus(page)).toBeVisible();
  await expect(page.locator('.error-boundary-screen')).toHaveCount(0);
  expect(movePosts(requestLog)).toHaveLength(1);
  expect(undoPosts(requestLog)).toHaveLength(1);
});
