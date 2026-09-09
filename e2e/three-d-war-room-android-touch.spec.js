import { devices, expect, test } from '@playwright/test';
import { buttonWithVisibleText, gameTurn, login, mockApi } from './helpers.js';
import { resolveBoard3DCameraFov } from '../frontend/src/components/Board3DConfig.js';
import { getWarRoomMobileFramingProfile } from '../frontend/src/components/WarRoomMobileFraming.js';

test.use({ ...devices['Pixel 5'] });

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const BLACK_AFTER_E4_FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

function normalized(vector) {
  const length = Math.hypot(...vector);
  return vector.map((value) => value / length);
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function projectWarRoomSquare(rect, square, worldY = 0.12) {
  const aspect = Math.max(0.35, rect.width / Math.max(1, rect.height));
  const mobileProfile = getWarRoomMobileFramingProfile({
    aspect,
    coarsePointer: true,
    viewportWidth: rect.width,
  });
  const profile = mobileProfile || (aspect >= 1.42
    ? { halfSpan: 5.38, padding: 1.07, minDistance: 13.2, maxDistance: 22.6, targetY: 1.08, targetZ: -0.16, cameraY: 7.35, cameraZ: 10.6 }
    : { halfSpan: 5.78, padding: 1.13, minDistance: 14.5, maxDistance: 25.6, targetY: 0.92, targetZ: -0.08, cameraY: 8.2, cameraZ: 10.72 });
  const verticalFov = resolveBoard3DCameraFov(aspect, { mobile: Boolean(mobileProfile) }) * Math.PI / 180;
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
  const limitingFov = Math.min(verticalFov, horizontalFov);
  const unclampedDistance = (profile.halfSpan / Math.tan(limitingFov / 2)) * profile.padding;
  const distance = Math.max(profile.minDistance, Math.min(profile.maxDistance, unclampedDistance));
  const target = [0, profile.targetY, -profile.targetZ];
  const direction = normalized([0, profile.cameraY, profile.cameraZ]);
  const camera = target.map((value, index) => value + direction[index] * distance);
  const fileIndex = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  const point = [fileIndex - 3.5, worldY, 4.5 - rank];
  const forward = normalized(target.map((value, index) => value - camera[index]));
  const right = normalized(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const relative = point.map((value, index) => value - camera[index]);
  const depth = dot(relative, forward);
  const ndcX = dot(relative, right) / (depth * Math.tan(verticalFov / 2) * aspect);
  const ndcY = dot(relative, up) / (depth * Math.tan(verticalFov / 2));
  return {
    x: rect.x + ((ndcX + 1) / 2) * rect.width,
    y: rect.y + ((1 - ndcY) / 2) * rect.height,
  };
}

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

function movePosts(requestLog) {
  return requestLog.filter((entry) => entry.method === 'POST' && /\/games\/[^/]+\/move$/.test(entry.path));
}

async function open3DFromAppearance(page) {
  const board3d = page.locator('[data-board3d-war-room="true"]');
  if (await board3d.isVisible().catch(() => false)) return;

  await expect(page.getByRole('button', { name: 'Vista · 2D', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Cambiar apariencia y piezas del tablero', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Ajustes' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('radiogroup', { name: 'Estilo de piezas' })).toBeVisible();
  await dialog.getByRole('radio', { name: /3D$/ }).click();
  await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await expect(board3d).toBeVisible({ timeout: 30_000 });
}

async function switchWarRoomTo2D(page) {
  const appearanceButton = page.locator('.board3d-customize');
  await expect(appearanceButton).toBeVisible({ timeout: 30_000 });
  await appearanceButton.click();
  const dialog = page.getByRole('dialog', { name: 'Ajustes' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radio', { name: /2D$/ }).click();
  const close = dialog.getByRole('button', { name: 'Cerrar', exact: true });
  await expect(close).toBeVisible();
  await close.evaluate((element) => element.click());
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  await expect(page.locator('.board-grid').first()).toBeVisible({ timeout: 30_000 });
}

async function installBlackQuickGameRoute(page) {
  const cpuOpening = { from: 'e2', to: 'e4', san: 'e4', piece: 'p', by: 'cpu' };
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

  await page.route('http://localhost:4000/api/games/e2e-black-game', async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(game) });
    }
    return route.fallback();
  });

  await page.route('http://localhost:4000/api/games', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const payload = route.request().postDataJSON?.() ?? {};
    if (payload.color !== 'b') return route.fallback();
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(game) });
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
  // Real CSS owns the Android composition now. Do not inject a fake shell ratio:
  // this lane should fail if mobile drifts back toward the old near-square board.
  await expect.poll(async () => {
    const rect = await shell.boundingBox();
    return rect ? rect.width / Math.max(1, rect.height) : 0;
  }).toBeGreaterThan(1.14);

  // Hans now has exactly one deterministic event per game. Android selection
  // must not depend on that event being the opening fire routine; the dedicated
  // "Hans waits for the rendered call" lane owns the service-door/fire contract.

  const matthiasCard = page.locator('.game-3d-matthias-card');
  const focusButton = page.getByRole('button', { name: 'Focus', exact: true });
  const abandonButton = page.getByRole('button', { name: 'Abandonar partida', exact: true });
  const appearanceButton = page.locator('.board3d-customize');
  const humanRail = page.locator('.game-board-stack-3d .game-player-rail.is-human');
  const musicRail = page.locator('.game-side-column-3d .game-side-music .music-deck-collapsed');
  const notationDisclosure = page.locator('.game-side-column-3d .game-notation-disclosure');
  await expect(matthiasCard).toBeVisible();
  await expect(focusButton).toBeVisible();
  await expect(abandonButton).toBeVisible();
  await expect(appearanceButton).toBeVisible();
  await expect(humanRail).toBeVisible();
  await expect(musicRail).toBeVisible();
  await expect(notationDisclosure).toBeVisible();

  const matthiasRect = await matthiasCard.boundingBox();
  const boardRect = await board3d.boundingBox();
  const focusRect = await focusButton.boundingBox();
  const appearanceRect = await appearanceButton.boundingBox();
  const humanRect = await humanRail.boundingBox();
  const musicRect = await musicRail.boundingBox();
  const notationRect = await notationDisclosure.boundingBox();
  expect(matthiasRect).not.toBeNull();
  expect(boardRect).not.toBeNull();
  expect(focusRect).not.toBeNull();
  expect(appearanceRect).not.toBeNull();
  expect(humanRect).not.toBeNull();
  expect(musicRect).not.toBeNull();
  expect(notationRect).not.toBeNull();
  expect(matthiasRect.height).toBeLessThanOrEqual(72);
  expect(humanRect.height).toBeLessThanOrEqual(50);
  expect(musicRect.height).toBeLessThanOrEqual(50);
  expect(notationRect.height).toBeLessThanOrEqual(50);
  // Phone utilities share a single compact shelf instead of consuming two rows.
  expect(Math.abs(musicRect.y - notationRect.y)).toBeLessThanOrEqual(2);
  expect(musicRect.x).toBeLessThan(notationRect.x);
  expect(focusRect.y + focusRect.height).toBeLessThanOrEqual(boardRect.y + 2);
  expect(appearanceRect.y).toBeLessThan(boardRect.y + 90);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

  expect(await canvas.evaluate((element) => getComputedStyle(element).touchAction)).toBe('none');
  expect(await canvas.evaluate((element) => {
    const value = getComputedStyle(element).webkitTapHighlightColor;
    return value === 'transparent' || value === 'rgba(0, 0, 0, 0)';
  })).toBe(true);

  const rect = await canvas.boundingBox();
  expect(rect).not.toBeNull();
  expect(rect.width / Math.max(1, rect.height)).toBeGreaterThan(1.14);

  // Product invariant: test the pixels the user actually sees, not only the
  // FEN/parser. d4/e5 are dark; e4/d5 are light. An inverted 3D material map
  // therefore fails this required Android lane immediately.
  const d4Luma = await canvasLuminanceAt(canvas, projectWarRoomSquare(rect, 'd4'));
  const e4Luma = await canvasLuminanceAt(canvas, projectWarRoomSquare(rect, 'e4'));
  const d5Luma = await canvasLuminanceAt(canvas, projectWarRoomSquare(rect, 'd5'));
  const e5Luma = await canvasLuminanceAt(canvas, projectWarRoomSquare(rect, 'e5'));
  expect(e4Luma - d4Luma).toBeGreaterThan(8);
  expect(d5Luma - e5Luma).toBeGreaterThan(8);

  const from = projectWarRoomSquare(rect, 'e2', 0.76);
  const to = projectWarRoomSquare(rect, 'e4');
  const cdp = await page.context().newCDPSession(page);

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
  // Critical contract: moving to a legal destination must happen on the real
  // second pointerdown, before Android delivers touchEnd.
  await expect.poll(() => movePosts(requestLog).length).toBe(1);
  await touchEnd(cdp);
});

test('War Room · orientación negra conserva back rank, color y navegación al alternar 3D↔2D', async ({ page }) => {
  test.setTimeout(75_000);
  await mockApi(page);
  await installBlackQuickGameRoute(page);
  await login(page);

  await buttonWithVisibleText(page, 'Partida rápida').click();
  const quickDialog = page.getByRole('dialog', { name: 'Configurar partida rápida' });
  await expect(quickDialog).toBeVisible();
  const settings = quickDialog.locator('details.quick-match-settings');
  await settings.locator('summary').click();
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
