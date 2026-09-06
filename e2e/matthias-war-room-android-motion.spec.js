import { devices, expect, test } from '@playwright/test';
import { buttonWithVisibleText, gameTurn, login, mockApi } from './helpers.js';

test.use({ ...devices['Pixel 5'] });

// Legal position after 1.Nf3 e5. e7 is now empty, so after 2.e4 the mocked
// Matthias reply Ke8-e7 is a real legal king move instead of an impossible
// state that the board animation layer is entitled to reject.
const KING_MOVE_START_FEN = 'rnbqkbnr/pppp1ppp/8/4p3/8/5N2/PPPPPPPP/RNBQKB1R w KQkq e6 0 2';
const KING_MOVED_FEN = 'rnbq1bnr/ppppkppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQ - 1 3';

async function open3DFromAppearance(page) {
  const board3d = page.locator('[data-board3d-war-room="true"]');
  if (await board3d.isVisible().catch(() => false)) return;

  // Quick games default to 3D, but the lazy Three/WebGL mount may lag the rest
  // of the game chrome for a few seconds on CI/Android. Give the real War Room
  // a chance to appear before assuming we need the explicit renderer fallback.
  await board3d.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => null);
  if (await board3d.isVisible().catch(() => false)) return;

  const appearanceButton = page.getByRole('button', {
    name: /^(?:Apariencia|Cambiar apariencia y piezas del tablero)$/,
  });
  await expect(appearanceButton).toBeVisible({ timeout: 12_000 });
  await appearanceButton.click();
  const dialog = page.getByRole('dialog', { name: 'Ajustes' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radio', { name: /3D$/ }).click();
  await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await expect(board3d).toBeVisible({ timeout: 30_000 });
}

async function installKingMoveScenario(page, calls) {
  const id = 'matthias-king-motion';
  let currentGame = null;

  // Override only this regression's game. mockApi remains responsible for auth,
  // profile, narrative and every unrelated endpoint.
  await page.route('http://localhost:4000/api/games', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const payload = route.request().postDataJSON?.() ?? {};
    currentGame = {
      id,
      fen: KING_MOVE_START_FEN,
      turn: 'w',
      humanColor: payload.color === 'b' ? 'b' : 'w',
      difficulty: Math.round(Number(payload.difficulty ?? 50)),
      status: 'playing',
      insufficientMatingMaterial: { w: false, b: false },
      isGameOver: false,
      history: [],
      lastMove: null,
      initialFen: KING_MOVE_START_FEN,
      ghostStyle: payload.ghostStyle || null,
    };
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify(currentGame),
    });
  });

  await page.route(`http://localhost:4000/api/games/${id}`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      status: currentGame ? 200 : 404,
      contentType: 'application/json',
      body: JSON.stringify(currentGame || { detail: 'Partida no encontrada' }),
    });
  });

  await page.route('http://localhost:4000/api/games/*/move', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const payload = route.request().postDataJSON?.() ?? {};
    calls.push(`${payload.from || '?'}-${payload.to || '?'}`);

    if (payload.from !== 'e2' || payload.to !== 'e4') {
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ detail: `King-motion E2E esperaba e2-e4, recibió ${payload.from || '?'}-${payload.to || '?'}` }),
      });
    }

    const humanMove = { from: 'e2', to: 'e4', san: 'e4', piece: 'p', captured: false, by: 'human' };
    const cpuMove = { from: 'e8', to: 'e7', san: 'Ke7', piece: 'k', captured: false, by: 'cpu' };
    currentGame = {
      ...(currentGame || {}),
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
      initialFen: KING_MOVE_START_FEN,
      ghostStyle: null,
    };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(currentGame),
    });
  });
}

test('War Room · Android usa al rey-peón como única presencia visual de Matthias', async ({ page }) => {
  test.setTimeout(75_000);

  await mockApi(page);
  await login(page);
  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expect(gameTurn(page)).toBeVisible();
  await open3DFromAppearance(page);

  const board3d = page.locator('[data-board3d-war-room="true"]');
  const briefing = page.locator('[data-matthias-war-room-presence="king-piece"]');

  await expect(board3d).toBeVisible({ timeout: 30_000 });
  await expect(briefing).toBeVisible({ timeout: 30_000 });
  await expect(briefing).toContainText('Matthias');
  await expect(briefing).toContainText(/nivel\s+\d+/i);

  // Matthias already exists physically in the room as the enemy king-pawn.
  // The compact rail must not pay for or visually duplicate the retired
  // portrait renderer, its fallback image, or a second Three.js context.
  await expect(page.locator('.game-3d-matthias-portrait-wrap')).toHaveCount(0);
  await expect(page.locator('.game-3d-matthias-portrait')).toHaveCount(0);
  await expect(page.locator('[data-matthias-three-avatar="true"]')).toHaveCount(0);
  await expect(briefing.locator('img, canvas')).toHaveCount(0);
});

test('War Room · el bocadillo de Matthias sigue al rey si cambia de casilla', async ({ page }) => {
  test.setTimeout(75_000);
  const moveCalls = [];

  // Opening banter is intentionally sparse and short-lived in production
  // (40% + anti-repeat + 4.7 s). This isolated regression keeps only that exact
  // TTL alive longer because hosted Android/software-WebGL can spend more than
  // 4.7 s presenting the mocked move. Production timing remains untouched.
  await page.addInitScript(() => {
    sessionStorage.setItem('chess-study-matthias-3d-opening-banter-v1', JSON.stringify({
      seenGameIds: [],
      lastEligibleStartShowed: false,
    }));
    Math.random = () => 0.1;
    const nativeSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = (callback, delay, ...args) => nativeSetTimeout(
      callback,
      Number(delay) === 4700 ? 30_000 : delay,
      ...args,
    );
  });

  await mockApi(page);
  await installKingMoveScenario(page, moveCalls);
  await login(page);

  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expect(gameTurn(page)).toBeVisible();
  await open3DFromAppearance(page);

  const board3d = page.locator('[data-board3d-war-room="true"]');
  const canvas = page.locator('.board3d-main-canvas');
  await expect(board3d).toBeVisible({ timeout: 30_000 });
  await expect(canvas).toBeVisible({ timeout: 30_000 });

  const bubble = page.getByRole('status', { name: 'Bravuconada de Matthias al iniciar la partida' });
  await expect(bubble).toBeVisible({ timeout: 10_000 });
  await expect(bubble).toHaveAttribute('data-matthias-square', 'e8');
  const before = await bubble.evaluate((element) => ({ left: element.style.left, top: element.style.top }));
  expect(before.left).not.toBe('');
  expect(before.top).not.toBe('');

  // Exercise the actual move immediately. The contract under test is "if
  // Matthias moves while he is speaking, the speech bubble follows the king".
  await canvas.focus();
  await canvas.press('ArrowUp');
  await canvas.press('Enter');
  await canvas.press('ArrowUp');
  await canvas.press('ArrowUp');
  await canvas.press('Enter');

  await expect.poll(() => moveCalls.length, { timeout: 3_000 }).toBe(1);
  await expect(bubble).toHaveAttribute('data-matthias-square', 'e7', { timeout: 3_000 });
  const after = await bubble.evaluate((element) => ({ left: element.style.left, top: element.style.top }));
  expect(after.top).not.toBe(before.top);
});
