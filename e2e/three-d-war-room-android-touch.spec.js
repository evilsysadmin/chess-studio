import { devices, expect, test } from '@playwright/test';
import { buttonWithVisibleText, gameTurn, login, mockApi, scheduleDomClick } from './helpers.js';
import { readBoard3DProjection } from './board3d-projection.js';

test.use({ ...devices['Pixel 5'] });

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const BLACK_AFTER_E4_FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const BLACK_AFTER_E4_E5_FEN = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2';


async function canvasLuminanceAt(canvas, point, radius = 3) {
  return canvas.evaluate((element, { point: samplePoint, radius: sampleRadius }) => {
    const rect = element.getBoundingClientRect();
    const scratch = document.createElement('canvas');
    scratch.width = element.width;
    scratch.height = element.height;
    const context = scratch.getContext('2d', { willReadFrequently: true });
    context.drawImage(element, 0, 0, scratch.width, scratch.height);

    const x = Math.round(((samplePoint.x - rect.left) / Math.max(1, rect.width)) * scratch.width);
    const y = Math.round(((samplePoint.y - rect.top) / Math.max(1, rect.height)) * scratch.height);
    const left = Math.max(0, x - sampleRadius);
    const top = Math.max(0, y - sampleRadius);
    const width = Math.max(1, Math.min(scratch.width - left, sampleRadius * 2 + 1));
    const height = Math.max(1, Math.min(scratch.height - top, sampleRadius * 2 + 1));
    const pixels = context.getImageData(left, top, width, height).data;

    let total = 0;
    let samples = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] === 0) continue;
      total += (pixels[index] * 0.2126) + (pixels[index + 1] * 0.7152) + (pixels[index + 2] * 0.0722);
      samples += 1;
    }
    return samples ? total / samples : 0;
  }, { point, radius });
}

async function touchStart(cdp, point) {
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: point.x, y: point.y, radiusX: 4, radiusY: 4, force: 0.7, id: 1 }],
  });
}

async function touchMove(cdp, point) {
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: point.x + 8, y: point.y + 5, radiusX: 4, radiusY: 4, force: 0.7, id: 1 }],
  });
}

async function touchEnd(cdp) {
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
}

async function twoFingerPan(cdp, a, b, delta = { x: 34, y: 26 }) {
  const point = (id, value) => ({ x: value.x, y: value.y, radiusX: 4, radiusY: 4, force: 0.7, id });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [point(1, a), point(2, b)],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      point(1, { x: a.x + delta.x, y: a.y + delta.y }),
      point(2, { x: b.x + delta.x, y: b.y + delta.y }),
    ],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

function movePosts(requestLog) {
  return requestLog.filter((entry) => entry.method === 'POST' && /\/games\/[^/]+\/move$/.test(entry.path));
}

async function open3DFromAppearance(page) {
  const board3d = page.locator('[data-board3d-war-room="true"]');
  try {
    await board3d.waitFor({ state: 'visible', timeout: 20_000 });
    return;
  } catch {
    // Fall through only when the current game genuinely opened in 2D.
  }

  const appearance = page.getByRole('button', { name: 'Cambiar apariencia y piezas del tablero', exact: true });
  await scheduleDomClick(appearance);
  const dialog = page.getByRole('dialog', { name: 'Ajustes' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('radiogroup', { name: 'Estilo de piezas' })).toBeVisible();
  await scheduleDomClick(dialog.getByRole('radio', { name: /3D$/ }));
  await scheduleDomClick(dialog.getByRole('button', { name: 'Cerrar', exact: true }));
  await expect(board3d).toBeVisible({ timeout: 30_000 });
}

async function openWarRoomAppearance(page) {
  const utilityButton = page.getByRole('button', { name: 'Más acciones de partida', exact: true });
  await expect(utilityButton).toBeVisible({ timeout: 30_000 });
  await utilityButton.click();
  const appearanceItem = page.getByRole('menuitem', { name: 'Apariencia', exact: true });
  await expect(appearanceItem).toBeVisible();
  await appearanceItem.click();
  const dialog = page.getByRole('dialog', { name: 'Ajustes' });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function switchWarRoomTo2D(page) {
  const dialog = await openWarRoomAppearance(page);
  await dialog.getByRole('radio', { name: /2D$/ }).click();
  const close = dialog.getByRole('button', { name: 'Cerrar', exact: true });
  await expect(close).toBeVisible();
  await close.evaluate((element) => element.click());
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  await expect(page.locator('.board-grid').first()).toBeVisible({ timeout: 30_000 });
}

async function installBlackQuickGameRoute(page, moveLog = []) {
  const cpuOpening = { from: 'e2', to: 'e4', san: 'e4', piece: 'p', captured: false, by: 'cpu' };
  const humanReply = { from: 'e7', to: 'e5', san: 'e5', piece: 'p', captured: false, by: 'human' };
  const game = {
    id: 'e2e-black-game',
    fen: BLACK_AFTER_E4_FEN,
    turn: 'b',
    humanColor: 'b',
    difficulty: 50,
    status: 'playing',
    insufficientMatingMaterial: { w: false, b: false },
    isGameOver: false,
    history: [cpuOpening],
    lastMove: cpuOpening,
    initialFen: START_FEN,
    ghostStyle: null,
  };
  let currentGame = game;

  await page.route('http://localhost:4000/api/games/e2e-black-game/move', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const payload = route.request().postDataJSON?.() ?? {};
    moveLog.push(payload);
    if (payload.from !== 'e7' || payload.to !== 'e5') {
      return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ detail: `E2E esperaba e7-e5, recibió ${payload.from}-${payload.to}` }) });
    }
    currentGame = {
      ...game,
      fen: BLACK_AFTER_E4_E5_FEN,
      turn: 'w',
      history: [cpuOpening, humanReply],
      lastMove: humanReply,
    };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(currentGame) });
  });

  await page.route('http://localhost:4000/api/games/e2e-black-game', async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(currentGame) });
    }
    return route.fallback();
  });

  await page.route('http://localhost:4000/api/games', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const payload = route.request().postDataJSON?.() ?? {};
    if (payload.color !== 'b') return route.fallback();
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(currentGame) });
  });
}

test('War Room · Android selecciona una pieza en pointerdown y muestra destinos reales', async ({ page }) => {
  test.setTimeout(75_000);
  await page.addInitScript(() => {
    window.__warRoomPointerCaptures = [];
    const originalSetPointerCapture = Element.prototype.setPointerCapture;
    Element.prototype.setPointerCapture = function patchedSetPointerCapture(pointerId) {
      window.__warRoomPointerCaptures.push({ pointerId, className: String(this.className || '') });
      return originalSetPointerCapture?.call(this, pointerId);
    };

    // Keep the WebGL backbuffer readable in this browser-only invariant test.
    // Production still uses the normal renderer attributes; this affects only
    // the E2E page before Three creates its context.
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function patchedGetContext(type, attributes) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
        return originalGetContext.call(this, type, { ...(attributes || {}), preserveDrawingBuffer: true });
      }
      return originalGetContext.call(this, type, attributes);
    };
  });

  const requestLog = [];
  await mockApi(page, { requestLog });
  await login(page);

  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expect(gameTurn(page)).toBeVisible();

  await open3DFromAppearance(page);

  const board3d = page.locator('[data-board3d-war-room="true"]');
  const canvas = page.locator('.board3d-main-canvas');
  const shell = page.locator('.board3d-main-shell');
  await expect(board3d).toBeVisible({ timeout: 30_000 });
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await expect(board3d).toHaveAttribute('data-board3d-camera', 'fixed-tactical', { timeout: 30_000 });
  // La geometría del tablero en vertical (88–100 % del ancho, 64 casillas en
  // pantalla) la acredita mobile-golden-path-war-room-invariants.spec.js con la
  // cámara real; aquí sólo exigimos que el shell exista antes de interactuar.
  await expect(shell).toBeVisible();

  const turnPill = page.locator('.game-3d-turn-pill');
  const focusButton = page.getByRole('button', { name: 'Focus', exact: true });
  const abandonButton = page.getByRole('button', { name: 'Abandonar partida', exact: true });
  const appearanceButton = page.locator('.board3d-customize');
  const utilityButton = page.getByRole('button', { name: 'Más acciones de partida', exact: true });
  const humanRail = page.locator('.game-board-stack-3d .game-player-rail.is-human');
  const musicRail = page.locator('.game-side-column-3d .game-side-music .music-deck-collapsed');
  const notationDisclosure = page.locator('.game-side-column-3d .game-notation-disclosure');
  await expect(turnPill).toBeVisible();
  await expect(focusButton).toBeVisible();
  await expect(abandonButton).toBeVisible();
  await expect(appearanceButton).toBeHidden();
  await expect(utilityButton).toBeVisible();
  await expect(humanRail).toBeHidden();
  await expect(musicRail).toBeHidden();
  await expect(notationDisclosure).toBeHidden();

  const matthiasRect = await turnPill.boundingBox();
  const boardRect = await board3d.boundingBox();
  const focusRect = await focusButton.boundingBox();
  const utilityRect = await utilityButton.boundingBox();
  expect(matthiasRect).not.toBeNull();
  expect(boardRect).not.toBeNull();
  expect(focusRect).not.toBeNull();
  expect(utilityRect).not.toBeNull();
  expect(matthiasRect.height).toBeLessThanOrEqual(72);
  expect(matthiasRect.width).toBeLessThanOrEqual(360);
  expect(Math.abs((matthiasRect.x + matthiasRect.width) - (boardRect.x + boardRect.width))).toBeLessThanOrEqual(10);
  expect(matthiasRect.y).toBeGreaterThanOrEqual(boardRect.y - 2);
  expect(matthiasRect.y + matthiasRect.height).toBeLessThanOrEqual(boardRect.y + 96);
  expect(focusRect.y).toBeGreaterThanOrEqual(boardRect.y - 2);
  expect(focusRect.y + focusRect.height).toBeLessThanOrEqual(boardRect.y + 96);
  expect(utilityRect.y).toBeLessThan(boardRect.y + 96);
  expect(utilityRect.x + utilityRect.width).toBeLessThanOrEqual(page.viewportSize().width + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

  expect(await canvas.evaluate((element) => getComputedStyle(element).touchAction)).toBe('none');
  expect(await canvas.evaluate((element) => {
    const value = getComputedStyle(element).webkitTapHighlightColor;
    return value === 'transparent' || value === 'rgba(0, 0, 0, 0)';
  })).toBe(true);

  const projection = await readBoard3DProjection(canvas);

  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();
  const cdp = await page.context().newCDPSession(page);
  await twoFingerPan(
    cdp,
    { x: canvasBox.x + canvasBox.width * .36, y: canvasBox.y + canvasBox.height * .52 },
    { x: canvasBox.x + canvasBox.width * .64, y: canvasBox.y + canvasBox.height * .52 },
  );
  await expect.poll(async () => await canvas.getAttribute('data-board3d-mobile-pan')).not.toBe('0.00,0.00');
  expect(movePosts(requestLog)).toHaveLength(0);
  const centerButton = page.getByRole('button', { name: 'Centrar', exact: true });
  await expect(centerButton).toBeVisible();
  const centerBox = await centerButton.boundingBox();
  expect(centerBox).not.toBeNull();
  expect(centerBox.width).toBeGreaterThanOrEqual(44);
  expect(centerBox.height).toBeGreaterThanOrEqual(44);
  await centerButton.click();
  await expect(canvas).toHaveAttribute('data-board3d-mobile-pan', '0.00,0.00');

  const d4Luma = await canvasLuminanceAt(canvas, projection.square('d4'));
  const e4Luma = await canvasLuminanceAt(canvas, projection.square('e4'));
  const d5Luma = await canvasLuminanceAt(canvas, projection.square('d5'));
  const e5Luma = await canvasLuminanceAt(canvas, projection.square('e5'));
  expect(e4Luma - d4Luma).toBeGreaterThan(8);
  expect(d5Luma - e5Luma).toBeGreaterThan(8);

  const from = projection.square('e2', 0.76);
  const to = projection.square('e4');

  await touchStart(cdp, from);
  await expect(canvas).toHaveAttribute('data-war-room-last-square', 'e2');
  await expect(board3d).toHaveAttribute('data-board3d-selected', 'e2');
  await expect.poll(async () => Number(await board3d.getAttribute('data-board3d-legal-target-count'))).toBeGreaterThan(0);
  await expect.poll(() => movePosts(requestLog).length).toBe(0);
  expect(await page.evaluate(() => window.__warRoomPointerCaptures.some((entry) => entry.className.includes('board3d-main-canvas')))).toBe(true);

  await touchMove(cdp, from);
  await touchEnd(cdp);

  await touchStart(cdp, to);
  await expect(canvas).toHaveAttribute('data-war-room-last-square', 'e4');
  await expect.poll(() => movePosts(requestLog).length).toBe(1);
  await touchEnd(cdp);
});

test('War Room · orientación negra conserva back rank, color, raycast y navegación al alternar 3D↔2D', async ({ page }) => {
  test.setTimeout(75_000);
  const moveLog = [];
  await mockApi(page);
  await installBlackQuickGameRoute(page, moveLog);
  await login(page);

  await buttonWithVisibleText(page, 'Partida rápida').click();
  const quickDialog = page.getByRole('dialog', { name: 'Configurar partida rápida' });
  await expect(quickDialog).toBeVisible();
  const settings = quickDialog.locator('details.quick-match-settings');
  await settings.locator(':scope > summary').click();
  const black = quickDialog.getByRole('radio', { name: 'Negras', exact: true });
  await black.click();
  await expect(black).toHaveAttribute('aria-checked', 'true');
  await quickDialog.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expect(gameTurn(page)).toBeVisible();

  await open3DFromAppearance(page);
  let board3d = page.locator('[data-board3d-war-room="true"]');
  let canvas = page.locator('.board3d-main-canvas');
  await expect(board3d).toBeVisible({ timeout: 30_000 });
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await expect(board3d).toHaveAttribute('data-board3d-focused', 'e8');

  await canvas.focus();
  await canvas.press('ArrowUp');
  await expect(board3d).toHaveAttribute('data-board3d-focused', 'e7');
  await canvas.press('ArrowDown');
  await expect(board3d).toHaveAttribute('data-board3d-focused', 'e8');
  await canvas.press('ArrowRight');
  await expect(board3d).toHaveAttribute('data-board3d-focused', 'd8');

  // La matriz publicada ya incluye la orientación negra de la cámara.
  const blackProjection = await readBoard3DProjection(canvas);
  const blackFrom = blackProjection.square('e7', 0.76);
  const blackTo = blackProjection.square('e5');
  const cdp = await page.context().newCDPSession(page);

  await touchStart(cdp, blackFrom);
  await expect(canvas).toHaveAttribute('data-war-room-last-square', 'e7');
  await expect(board3d).toHaveAttribute('data-board3d-selected', 'e7');
  await expect.poll(async () => Number(await board3d.getAttribute('data-board3d-legal-target-count'))).toBeGreaterThan(0);
  await touchMove(cdp, blackFrom);
  await touchEnd(cdp);

  await touchStart(cdp, blackTo);
  await expect(canvas).toHaveAttribute('data-war-room-last-square', 'e5');
  await expect.poll(() => moveLog.length).toBe(1);
  expect(moveLog[0]).toMatchObject({ from: 'e7', to: 'e5' });
  await touchEnd(cdp);

  await switchWarRoomTo2D(page);
  const squares = page.locator('.board-grid').first().locator('.square');
  await expect(squares).toHaveCount(64);
  await expect(squares.first()).toHaveAttribute('aria-label', /^Casilla h1,/);
  await expect(squares.last()).toHaveAttribute('aria-label', /^Casilla a8,/);

  const d8 = page.locator('.square[aria-label^="Casilla d8,"]').first();
  const e8 = page.locator('.square[aria-label^="Casilla e8,"]').first();
  const d1 = page.locator('.square[aria-label^="Casilla d1,"]').first();
  const e1 = page.locator('.square[aria-label^="Casilla e1,"]').first();
  await expect(d8).toHaveClass(/dark/);
  await expect(e8).toHaveClass(/light/);
  await expect(d1).toHaveClass(/light/);
  await expect(e1).toHaveClass(/dark/);
  await expect(d8).toHaveAttribute('aria-label', /dama negra/);
  await expect(e8).toHaveAttribute('aria-label', /rey negro/);
  await expect(d1).toHaveAttribute('aria-label', /dama blanca/);
  await expect(e1).toHaveAttribute('aria-label', /rey blanco/);

  await open3DFromAppearance(page);
  board3d = page.locator('[data-board3d-war-room="true"]');
  canvas = page.locator('.board3d-main-canvas');
  await expect(board3d).toBeVisible({ timeout: 30_000 });
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await expect(board3d).toHaveAttribute('data-board3d-focused', 'e8');
});
