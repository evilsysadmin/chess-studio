import { expect, test } from '@playwright/test';
import { resolveBoard3DCameraFov } from '../frontend/src/components/Board3DConfig.js';
import { buttonWithVisibleText, login, mockApi } from './helpers.js';

const WAR_ROOM_READY_TIMEOUT = 45_000;
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const CAPTURE_READY_FEN = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2';
const CAPTURE_END_FEN = 'rnbqkb1r/ppp1pppp/5n2/3P4/8/8/PPPP1PPP/RNBQKBNR w KQkq - 1 3';

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
  const profile = aspect >= 1.42
    ? { halfSpan: 5.38, padding: 1.07, minDistance: 13.2, targetY: 1.08, targetZ: -0.16, cameraY: 7.35, cameraZ: 10.6 }
    : { halfSpan: 5.78, padding: 1.13, minDistance: 14.5, targetY: 0.92, targetZ: -0.08, cameraY: 8.2, cameraZ: 10.72 };
  // Keep the browser input projection on the same public FOV contract as the
  // real renderer. The old helper hardcoded the historical 40° desktop lens,
  // so a near-orthographic camera made Playwright click the wrong squares.
  const verticalFov = resolveBoard3DCameraFov(aspect) * Math.PI / 180;
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
  const limitingFov = Math.min(verticalFov, horizontalFov);
  const unclampedDistance = (profile.halfSpan / Math.tan(limitingFov / 2)) * profile.padding;
  const distance = Math.max(profile.minDistance, Math.min(88, unclampedDistance));
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

async function clickWarRoomSquare(page, rect, square, worldY = 0.12) {
  const point = projectWarRoomSquare(rect, square, worldY);
  await page.mouse.click(point.x, point.y);
}

async function setRendererViaAppearance(page, renderer) {
  const warRoom = page.locator('[data-board3d-war-room="true"]');
  const button = await warRoom.count()
    ? page.getByRole('button', { name: 'Apariencia', exact: true })
    : page.getByRole('button', { name: 'Cambiar apariencia y piezas del tablero', exact: true });

  await expect(button).toBeVisible({ timeout: WAR_ROOM_READY_TIMEOUT });
  await expect(button).toBeEnabled();
  try {
    await button.click({ timeout: 12_000 });
  } catch {
    await button.evaluate((element) => element.click());
  }

  const dialog = page.getByRole('dialog', { name: 'Ajustes' });
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await expect(dialog.getByRole('radio', { name: /2D$/ })).toBeVisible();
  await expect(dialog.getByRole('radio', { name: /3D$/ })).toBeVisible();
  await expect(dialog.getByRole('radiogroup', { name: 'Estilo de piezas' })).toBeVisible();
  await dialog.getByRole('radio', { name: new RegExp(`${renderer}$`) }).click();

  // Cambiar renderer puede montar/desmontar Three mientras Ajustes sigue
  // abierto. Este spec acredita paridad 2D↔3D, no el hit-testing del botón
  // Cerrar: una vez visible + enabled, invocamos el mismo handler sin esperar
  // a que Playwright considere estable toda la escena WebGL de fondo.
  const close = dialog.getByRole('button', { name: 'Cerrar', exact: true });
  await expect(close).toBeVisible();
  await expect(close).toBeEnabled();
  await close.evaluate((element) => element.click());
  await expect(dialog).toBeHidden({ timeout: 15_000 });
}

async function waitForWarRoomRenderer(page) {
  const board3d = page.locator('[data-board3d-war-room="true"]');
  const canvas = page.locator('.board3d-main-canvas');

  // The Suspense placeholder is intentionally ephemeral. Testing that it is
  // visible after first observing it races against a fast chunk/Three mount:
  // the useful contract is that the final War Room and canvas become visible.
  await expect(board3d).toBeVisible({ timeout: WAR_ROOM_READY_TIMEOUT });
  await expect(canvas).toBeVisible({ timeout: WAR_ROOM_READY_TIMEOUT });
  return { board3d, canvas };
}

function captureContinuationPayload(id, from, to) {
  if (from === 'e2' && to === 'e4') {
    const humanMove = { from: 'e2', to: 'e4', san: 'e4', piece: 'p', captured: false, by: 'human' };
    const cpuMove = { from: 'd7', to: 'd5', san: 'd5', piece: 'p', captured: false, by: 'cpu' };
    return {
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
    };
  }
  if (from === 'e4' && to === 'd5') {
    const firstHuman = { from: 'e2', to: 'e4', san: 'e4', piece: 'p', captured: false, by: 'human' };
    const firstCpu = { from: 'd7', to: 'd5', san: 'd5', piece: 'p', captured: false, by: 'cpu' };
    const capture = { from: 'e4', to: 'd5', san: 'exd5', piece: 'p', captured: true, by: 'human' };
    const cpuMove = { from: 'g8', to: 'f6', san: 'Nf6', piece: 'n', captured: false, by: 'cpu' };
    return {
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
    };
  }
  throw new Error(`E2E captura cross-renderer no simulada: ${from}-${to}`);
}

async function installCaptureContinuationRoute(page, requestLog) {
  await page.route('http://localhost:4000/api/games/*/move', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const url = new URL(route.request().url());
    const id = url.pathname.match(/\/games\/([^/]+)\/move$/)?.[1] || '1';
    const payload = route.request().postDataJSON?.() ?? {};
    requestLog.push({
      method: 'POST',
      path: url.pathname,
      idempotencyKey: route.request().headers()['idempotency-key'] || null,
    });
    const game = captureContinuationPayload(id, payload.from, payload.to);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(game) });
  });
}

async function openQuickGameWarRoom(page, requestLog = [], { afterMockApi = null } = {}) {
  await page.setViewportSize({ width: 1440, height: 960 });
  await mockApi(page, { requestLog });
  if (afterMockApi) await afterMockApi();
  await login(page);

  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();

  // Product contract: quick games now enter War Room directly. Renderer
  // switching remains a parity/fallback feature, not a prerequisite for 3D.
  // Readiness therefore belongs to the actual renderer, not to the legacy
  // status strip that War Room is allowed to fold or replace.
  const warRoom = page.locator('.board-live-row.is-3d-warroom');
  await expect(warRoom).toBeVisible({ timeout: WAR_ROOM_READY_TIMEOUT });
  const { board3d, canvas } = await waitForWarRoomRenderer(page);
  return { warRoom, board3d, canvas };
}

test('War Room · selección y jugadas legales sobreviven 2D→3D y el teclado usa el mismo estado', async ({ page }) => {
  test.setTimeout(90_000);

  const requestLog = [];
  await page.setViewportSize({ width: 1440, height: 960 });
  await mockApi(page, { requestLog });
  await login(page);
  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();

  // Este caso es específicamente un contrato 2D→3D. Primero acreditamos que
  // la nueva casa 3D ha montado y sólo entonces optamos por el fallback 2D.
  await expect(page.locator('.board-live-row.is-3d-warroom')).toBeVisible({ timeout: WAR_ROOM_READY_TIMEOUT });
  await waitForWarRoomRenderer(page);

  // This test is specifically a 2D→3D parity contract. 2D is now an explicit
  // fallback, so opt into it instead of relying on the historical default.
  await setRendererViaAppearance(page, '2D');
  const e2 = page.locator('.square[aria-label^="Casilla e2,"]');
  const e3 = page.locator('.square[aria-label^="Casilla e3,"]');
  const e4 = page.locator('.square[aria-label^="Casilla e4,"]');
  await e2.click();
  await expect(e2).toHaveClass(/selected/);
  await expect(e3).toHaveClass(/legal-move/);
  await expect(e4).toHaveClass(/legal-move/);

  await setRendererViaAppearance(page, '3D');
  const { board3d, canvas } = await waitForWarRoomRenderer(page);
  await expect(board3d).toHaveAttribute('data-board3d-selected', 'e2');
  await expect(board3d).toHaveAttribute('data-board3d-legal-target-count', '2');

  await canvas.focus();
  await canvas.press('ArrowUp');
  await expect(board3d).toHaveAttribute('data-board3d-focused', 'e2');
  await canvas.press('Enter');
  await expect(board3d).toHaveAttribute('data-board3d-selected', '');
  await expect(board3d).toHaveAttribute('data-board3d-legal-target-count', '0');

  await canvas.press('Enter');
  await expect(board3d).toHaveAttribute('data-board3d-selected', 'e2');
  await expect(board3d).toHaveAttribute('data-board3d-legal-target-count', '2');
  await canvas.press('ArrowUp');
  await canvas.press('ArrowUp');
  await expect(board3d).toHaveAttribute('data-board3d-focused', 'e4');
  await canvas.press('Enter');

  await expect.poll(() => requestLog.filter((entry) => entry.method === 'POST' && /\/games\/[^/]+\/move$/.test(entry.path)).length).toBe(1);
});

test('War Room · desktop input mantiene cámara fija y juega e2→e4', async ({ page }) => {
  test.setTimeout(180_000);

  const requestLog = [];
  const { board3d, canvas } = await openQuickGameWarRoom(page, requestLog, {
    afterMockApi: () => installCaptureContinuationRoute(page, requestLog),
  });
  await expect(board3d).toHaveAttribute('data-board3d-scene', 'premium');
  await expect(board3d).toHaveAttribute('data-board3d-camera', 'fixed-tactical');

  const canvasRect = await canvas.boundingBox();
  expect(canvasRect).not.toBeNull();

  await page.mouse.move(canvasRect.x + canvasRect.width * 0.2, canvasRect.y + canvasRect.height * 0.25);
  await page.mouse.move(canvasRect.x + canvasRect.width * 0.8, canvasRect.y + canvasRect.height * 0.7);
  await expect(board3d).toHaveAttribute('data-board3d-inspect', 'false');
  await expect(board3d).toHaveAttribute('data-board3d-camera', 'fixed-tactical');

  await clickWarRoomSquare(page, canvasRect, 'e2', 0.76);
  await clickWarRoomSquare(page, canvasRect, 'e4');
  await expect.poll(() => requestLog.filter((entry) => entry.method === 'POST' && /\/games\/[^/]+\/move$/.test(entry.path)).length).toBe(1);

  // Primera vuelta 3D→2D: la respuesta CPU deja d5 capturable y el estado
  // común debe conservar exactamente esa posición, no una copia del renderer.
  await setRendererViaAppearance(page, '2D');
  const e4 = page.getByRole('button', { name: /^Casilla e4, peón blanco/i });
  const d5 = page.getByRole('button', { name: /^Casilla d5, peón negro/i });
  await expect(e4).toBeVisible({ timeout: WAR_ROOM_READY_TIMEOUT });
  await expect(d5).toBeVisible();
  await e4.click();
  await expect(e4).toHaveClass(/selected/);
  await expect(d5).toHaveClass(/legal-capture/);

  // Segunda vuelta 2D→3D: la selección e4 debe sobrevivir al remount. La
  // captura ordinaria se ejecuta en 3D y sólo puede producir una mutación.
  await setRendererViaAppearance(page, '3D');
  await expect(board3d).toBeVisible({ timeout: WAR_ROOM_READY_TIMEOUT });
  await expect(canvas).toBeVisible({ timeout: WAR_ROOM_READY_TIMEOUT });
  await expect(board3d).toHaveAttribute('data-board3d-selected', 'e4');
  const captureRect = await canvas.boundingBox();
  expect(captureRect).not.toBeNull();
  await clickWarRoomSquare(page, captureRect, 'd5');
  await expect.poll(() => requestLog.filter((entry) => entry.method === 'POST' && /\/games\/[^/]+\/move$/.test(entry.path)).length).toBe(2);
  await expect(board3d).toHaveAttribute('data-board3d-selected', '');

  // Vuelta final a 2D: la torre/ghost/copia visual 3D no puede conservar al
  // peón negro capturado ni dejar selección efímera pegada al renderer.
  await setRendererViaAppearance(page, '2D');
  await expect(page.getByRole('button', { name: /^Casilla d5, peón blanco/i })).toBeVisible({ timeout: WAR_ROOM_READY_TIMEOUT });
  await expect(page.getByRole('button', { name: /^Casilla e4, vacía/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Casilla d5, peón negro/i })).toHaveCount(0);
  await expect(page.locator('.square.selected')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Casilla f6, caballo negro/i })).toBeVisible();
  expect(requestLog.filter((entry) => entry.method === 'POST' && /\/games\/[^/]+\/move$/.test(entry.path))).toHaveLength(2);
});

test('Partida rápida · una partida activa · vista 3D usa la Sala de guerra y sigue cabiendo en móvil', async ({ page }) => {
  test.setTimeout(90_000);

  const { warRoom, board3d } = await openQuickGameWarRoom(page);
  await expect(board3d).toHaveAttribute('data-board3d-scene', 'premium');
  await expect(board3d).toHaveAttribute('data-board3d-camera', 'fixed-tactical');
  await expect(warRoom.getByRole('complementary', { name: 'Puesto táctico de Matthias' })).toBeVisible();
  await expect(warRoom.getByText('COMANDANTE RIVAL', { exact: true })).toBeVisible();
  await expect(warRoom.getByText('SALA DE GUERRA · CÁMARA TÁCTICA', { exact: true })).toBeVisible();
  await expect(warRoom.locator('.game-3d-warroom-controls')).toBeHidden();
  await expect(page.locator('.game-board-stack-3d .matthias-board-bubble')).toBeHidden();

  const portrait = warRoom.locator('.game-3d-matthias-portrait');
  await expect(portrait).toBeVisible();
  expect(await portrait.evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);

  const desktopGeometry = await page.locator('.board3d-main-shell').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  expect(desktopGeometry.width).toBeGreaterThan(700);
  expect(desktopGeometry.height).toBeGreaterThan(700);

  const warRoomGeometry = await warRoom.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, right: rect.right, scrollWidth: document.documentElement.scrollWidth, viewportWidth: window.innerWidth };
  });
  expect(warRoomGeometry.width).toBeGreaterThan(1380);
  expect(warRoomGeometry.right).toBeLessThanOrEqual(warRoomGeometry.viewportWidth + 1);
  expect(warRoomGeometry.scrollWidth).toBeLessThanOrEqual(warRoomGeometry.viewportWidth + 1);

  const humanRail = page.locator('.game-board-stack-3d .game-player-rail.is-human');
  const controls = page.locator('.game-board-stack-3d .game-command-deck');
  await expect(humanRail).toBeVisible();
  await expect(controls).toBeVisible();
  const footerGeometry = await page.evaluate(() => {
    const player = document.querySelector('.game-board-stack-3d .game-player-rail.is-human')?.getBoundingClientRect();
    const actions = document.querySelector('.game-board-stack-3d .game-command-deck')?.getBoundingClientRect();
    return player && actions ? { playerTop: player.top, actionsTop: actions.top } : null;
  });
  expect(footerGeometry).not.toBeNull();
  expect(Math.abs(footerGeometry.playerTop - footerGeometry.actionsTop)).toBeLessThan(4);

  await page.setViewportSize({ width: 1662, height: 796 });
  await page.waitForTimeout(180);
  const shortDesktopGeometry = await page.locator('.board3d-main-shell').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height, bottom: rect.bottom };
  });
  expect(shortDesktopGeometry.width).toBeGreaterThan(700);
  expect(shortDesktopGeometry.height).toBeGreaterThan(580);
  expect(shortDesktopGeometry.height).toBeLessThan(625);
  expect(shortDesktopGeometry.bottom).toBeLessThanOrEqual(796);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(180);
  const mobileGeometry = await page.locator('.board3d-main-shell').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, right: rect.right, scrollWidth: document.documentElement.scrollWidth, viewportWidth: window.innerWidth };
  });
  expect(mobileGeometry.width).toBeGreaterThan(320);
  expect(mobileGeometry.right).toBeLessThanOrEqual(mobileGeometry.viewportWidth + 1);
  expect(mobileGeometry.scrollWidth).toBeLessThanOrEqual(mobileGeometry.viewportWidth + 1);
});