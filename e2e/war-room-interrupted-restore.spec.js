import { expect, test } from '@playwright/test';
import { buttonWithVisibleText, clickBoardMove, login, mockApi } from './helpers.js';

const WAR_ROOM_READY_TIMEOUT = 45_000;
const ACTIVE_GAME_SESSION_KEY = 'chess-study-active-game-session-v1';
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
    message: `El snapshot activo debe persistir ${fen} antes de interrumpir el renderer`,
  }).toBe(true);
}

async function expectCleanWarRoom(page) {
  const board3d = page.locator('[data-board3d-war-room="true"]');
  const canvas = page.locator('.board3d-main-canvas');
  await expect(board3d).toBeVisible({ timeout: WAR_ROOM_READY_TIMEOUT });
  await expect(canvas).toHaveCount(1, { timeout: WAR_ROOM_READY_TIMEOUT });
  await expect(board3d).toHaveAttribute('data-board3d-selected', '');
  await expect(page.locator('.error-boundary-screen')).toHaveCount(0);
  return { board3d, canvas };
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

  // La barrera de snapshot acredita que React ya aceptó la respuesta y armó la
  // transición 3D. Recargamos inmediatamente después, sin esperar el settle.
  await clickBoardMove(page, 'e2', 'e4');
  await expect.poll(() => movePosts(requestLog).length, { timeout: 5_000 }).toBe(1);
  await expectPersistedFen(page, AFTER_OPENING_FEN);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectCleanWarRoom(page);

  // No basta con que vuelva un canvas: la posición restaurada debe seguir
  // aceptando la captura real que sólo existe si e4/d5 sobrevivieron al reload.
  await clickBoardMove(page, 'e4', 'd5');
  await expect.poll(() => movePosts(requestLog).length, { timeout: 5_000 }).toBe(2);
  await expectPersistedFen(page, AFTER_CAPTURE_FEN);

  // Segundo corte, ahora durante una captura: cubre ghost de pieza capturada,
  // offsets de body motion y reactive-light rollback además del viaje normal.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectCleanWarRoom(page);

  // 2D actúa como sonda accesible del estado común restaurado. Si quedara una
  // escena 3D visualmente limpia pero lógicamente vieja, estas casillas fallan.
  await page.getByRole('button', { name: 'Apariencia', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Ajustes' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radio', { name: /2D$/ }).click();
  const close = dialog.getByRole('button', { name: 'Cerrar', exact: true });
  await expect(close).toBeVisible();
  await close.evaluate((element) => element.click());
  await expect(dialog).toBeHidden({ timeout: 15_000 });

  await expect(page.getByRole('button', { name: /^Casilla d5, peón blanco/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Casilla f6, caballo negro/i })).toBeVisible();
  await expect(page.locator('.board3d-main-canvas')).toHaveCount(0);
  await expect(page.locator('.error-boundary-screen')).toHaveCount(0);
});
