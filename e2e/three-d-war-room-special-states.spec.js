import { expect, test } from '@playwright/test';
import { buttonWithVisibleText, gameStatus, login, mockApi } from './helpers.js';

const WAR_ROOM_READY_TIMEOUT = 45_000;
const SPECIAL_STATE_TIMEOUT = 30_000;
const CHECK_START_FEN = 'k3r3/8/8/8/8/8/4Q3/7K w - - 0 1';
const CHECK_END_FEN = 'k7/8/8/7Q/8/8/8/4r2K w - - 2 2';
const MATE_START_FEN = '7k/8/5KQ1/8/8/8/8/8 w - - 0 1';
const MATE_END_FEN = '7k/6Q1/5K2/8/8/8/8/8 b - - 1 1';

async function setRendererViaAppearance(page, renderer) {
  const warRoom = page.locator('[data-board3d-war-room="true"]');
  if (await warRoom.count()) {
    await page.getByRole('button', { name: 'Apariencia', exact: true }).click();
  } else {
    await page.getByRole('button', { name: 'Cambiar apariencia y piezas del tablero', exact: true }).click();
  }

  const dialog = page.getByRole('dialog', { name: 'Ajustes' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radio', { name: new RegExp(`${renderer}$`) }).click();
  await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
}

function specialInitialPayload({ id, scenario }) {
  return {
    id,
    fen: scenario === 'mate' ? MATE_START_FEN : CHECK_START_FEN,
    turn: 'w',
    humanColor: 'w',
    difficulty: 50,
    status: 'playing',
    insufficientMatingMaterial: { w: false, b: false },
    isGameOver: false,
    history: [],
    lastMove: null,
    initialFen: scenario === 'mate' ? MATE_START_FEN : CHECK_START_FEN,
    ghostStyle: null,
  };
}

function specialStatePayload({ id, scenario, from, to }) {
  if (scenario === 'mate') {
    if (from !== 'g6' || to !== 'g7') {
      throw new Error(`E2E mate esperaba g6-g7, recibió ${from}-${to}`);
    }
    const move = {
      from,
      to,
      san: 'Qg7#',
      piece: 'q',
      captured: false,
      by: 'human',
    };
    return {
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
      initialFen: MATE_START_FEN,
      ghostStyle: null,
    };
  }

  // Producción no devuelve el estado intermedio justo después de una jugada
  // humana no terminal: el backend calcula la respuesta CPU y serializa ambas
  // medias jugadas dentro del mismo POST /move. Por eso el escenario de jaque
  // debe terminar con una respuesta realista de Matthias. Qh5 libera la columna
  // e y Matthias replica Re1+, dejando al rey humano h1 en jaque y el turno de
  // nuevo en blancas.
  if (from !== 'e2' || to !== 'h5') {
    throw new Error(`E2E check esperaba e2-h5, recibió ${from}-${to}`);
  }
  const humanMove = {
    from: 'e2',
    to: 'h5',
    san: 'Qh5',
    piece: 'q',
    captured: false,
    by: 'human',
  };
  const cpuMove = {
    from: 'e8',
    to: 'e1',
    san: 'Re1+',
    piece: 'r',
    captured: false,
    by: 'cpu',
  };
  return {
    id,
    fen: CHECK_END_FEN,
    turn: 'w',
    humanColor: 'w',
    difficulty: 50,
    status: 'check',
    insufficientMatingMaterial: { w: false, b: false },
    isGameOver: false,
    history: [humanMove, cpuMove],
    lastMove: cpuMove,
    initialFen: CHECK_START_FEN,
    ghostStyle: null,
  };
}

async function installSpecialStateRoutes(page, scenario, requestLog) {
  const id = `e2e-war-room-${scenario}`;
  let currentGame = specialInitialPayload({ id, scenario });

  // mockApi sigue poseyendo auth/perfil/resto de superficie. Estas rutas
  // específicas modelan una única partida persistida, incluido el GET de
  // reconciliación. Antes el POST especial devolvía una foto correcta pero el
  // store interno del mock común no conocía ese id: un GET posterior podía
  // responder 404/foto antigua y pisar el jaque no terminal. Mate no sufría el
  // mismo camino de reconciliación, de ahí la falsa asimetría del gate.
  await page.route('http://localhost:4000/api/games', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const url = new URL(route.request().url());
    requestLog.push({
      method: 'POST',
      path: url.pathname,
      idempotencyKey: route.request().headers()['idempotency-key'] || null,
    });
    currentGame = specialInitialPayload({ id, scenario });
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify(currentGame),
    });
  });

  await page.route(`http://localhost:4000/api/games/${id}`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(currentGame),
    });
  });

  await page.route('http://localhost:4000/api/games/*/move', async (route) => {
    const url = new URL(route.request().url());
    const routeId = url.pathname.match(/\/games\/([^/]+)\/move$/)?.[1];
    const payload = route.request().postDataJSON?.() ?? {};
    requestLog.push({
      method: 'POST',
      path: url.pathname,
      idempotencyKey: route.request().headers()['idempotency-key'] || null,
    });
    currentGame = specialStatePayload({ id: routeId, scenario, from: payload.from, to: payload.to });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(currentGame) });
  });
}

async function startScenario(page, scenario, requestLog) {
  // Esta suite valida paridad de estado, no cinemática. En los runners de CI
  // WebGL suele caer a render por software y cada transición física puede
  // retrasar varios segundos la confirmación visual sin cambiar el contrato.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 960 });
  await mockApi(page, { requestLog });
  await installSpecialStateRoutes(page, scenario, requestLog);
  await login(page);
  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expect(gameStatus(page)).toBeVisible();
}

async function waitForWarRoom(page) {
  const board3d = page.locator('[data-board3d-war-room="true"]');
  const canvas = page.locator('.board3d-main-canvas');
  await expect(board3d).toBeVisible({ timeout: WAR_ROOM_READY_TIMEOUT });
  await expect(canvas).toBeVisible({ timeout: WAR_ROOM_READY_TIMEOUT });
  return { board3d, canvas };
}

async function pressKeys(page, keys) {
  for (const key of keys) await page.keyboard.press(key);
}

function movePosts(requestLog) {
  return requestLog.filter((entry) => entry.method === 'POST' && /\/games\/[^/]+\/move$/.test(entry.path));
}

test('War Room parity · respuesta CPU que da jaque se conserva al volver de 3D a 2D', async ({ page }) => {
  test.setTimeout(120_000);
  const requestLog = [];
  await startScenario(page, 'check', requestLog);

  const queen = page.getByRole('button', { name: /^Casilla e2, dama blanca/i });
  await queen.click();
  await expect(queen).toHaveClass(/selected/);

  await setRendererViaAppearance(page, '3D');
  const { board3d, canvas } = await waitForWarRoom(page);
  await expect(board3d).toHaveAttribute('data-board3d-selected', 'e2');
  await expect(board3d).toHaveAttribute('data-board3d-focused', 'e1');

  // Desde el foco táctico inicial e1 llevamos el cursor a h5 y ejecutamos Qh5.
  // La misma respuesta HTTP contiene la réplica CPU Re1+, como en producción.
  await canvas.focus();
  await pressKeys(page, [
    'ArrowRight', 'ArrowRight', 'ArrowRight',
    'ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp',
  ]);
  await expect(board3d).toHaveAttribute('data-board3d-focused', 'h5');
  await page.keyboard.press('Enter');

  await expect.poll(() => movePosts(requestLog).length).toBe(1);
  await expect(page.getByRole('dialog', { name: /partida finalizada/i })).toHaveCount(0);
  await expect(board3d).toHaveAttribute('data-board3d-selected', '');

  // Separar tablero y texto vuelve el gate diagnóstico: primero demostramos
  // que la respuesta CPU llegó al estado visual, y sólo después exigimos que
  // gameStatusView publique el mismo jaque. Si algo vuelve a desincronizarse,
  // CI dirá cuál de las dos capas quedó atrás en vez de un genérico “no Jaque”.
  await setRendererViaAppearance(page, '2D');
  await expect(page.getByRole('button', { name: /Casilla h1, rey blanco, rey en jaque/i })).toBeVisible({ timeout: SPECIAL_STATE_TIMEOUT });
  await expect.poll(
    async () => (await gameStatus(page).textContent())?.trim() || '',
    { timeout: SPECIAL_STATE_TIMEOUT, message: 'El tablero ya refleja Re1+, pero el estado público debe converger a Jaque' },
  ).toBe('Jaque');
  expect(movePosts(requestLog)).toHaveLength(1);
});

test('War Room parity · selección 2D puede rematar jaque mate desde el teclado 3D una sola vez', async ({ page }) => {
  test.setTimeout(120_000);
  const requestLog = [];
  await startScenario(page, 'mate', requestLog);

  const queen = page.getByRole('button', { name: /^Casilla g6, dama blanca/i });
  await queen.click();
  await expect(queen).toHaveClass(/selected/);

  await setRendererViaAppearance(page, '3D');
  const { board3d, canvas } = await waitForWarRoom(page);
  await expect(board3d).toHaveAttribute('data-board3d-selected', 'g6');

  await canvas.focus();
  await pressKeys(page, ['ArrowRight', 'ArrowRight', ...Array(6).fill('ArrowUp')]);
  await expect(board3d).toHaveAttribute('data-board3d-focused', 'g7');
  await page.keyboard.press('Enter');

  await expect.poll(() => movePosts(requestLog).length).toBe(1);
  const endgame = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Jaque mate', exact: true }) });
  await expect(endgame).toBeVisible({ timeout: SPECIAL_STATE_TIMEOUT });
  await expect(endgame.getByText('¡Ganaste la partida!', { exact: true })).toBeVisible();
  await expect(page.locator('.error-boundary-screen')).toHaveCount(0);
  expect(movePosts(requestLog)).toHaveLength(1);
});