import { expect, test } from '@playwright/test';
import { buttonWithVisibleText, clickBoardMove, login, mockApi } from './helpers.js';

const WAR_ROOM_READY_TIMEOUT = 45_000;
const CYCLES = 12;
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const CAPTURE_READY_FEN = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2';
const CAPTURE_END_FEN = 'rnbqkb1r/ppp1pppp/5n2/3P4/8/8/PPPP1PPP/RNBQKBNR w KQkq - 1 3';

async function installRuntimeProbe(page) {
  await page.addInitScript(() => {
    const activeRafs = new Set();
    const activeIntervals = new Set();
    const trackedTypes = new Set(['resize', 'visibilitychange', 'keydown', 'pointermove', 'pointerup']);
    const listenerRecords = new Map();

    const originalRaf = window.requestAnimationFrame.bind(window);
    const originalCancelRaf = window.cancelAnimationFrame.bind(window);
    const originalSetInterval = window.setInterval.bind(window);
    const originalClearInterval = window.clearInterval.bind(window);
    const originalAdd = EventTarget.prototype.addEventListener;
    const originalRemove = EventTarget.prototype.removeEventListener;

    function captureValue(options) {
      return typeof options === 'boolean' ? options : Boolean(options?.capture);
    }

    function listenerKey(target, type) {
      return `${target === window ? 'window' : 'document'}:${type}`;
    }

    window.requestAnimationFrame = (callback) => {
      let id = 0;
      id = originalRaf((timestamp) => {
        activeRafs.delete(id);
        callback(timestamp);
      });
      activeRafs.add(id);
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      activeRafs.delete(id);
      return originalCancelRaf(id);
    };

    window.setInterval = (callback, delay, ...args) => {
      const id = originalSetInterval(callback, delay, ...args);
      activeIntervals.add(id);
      return id;
    };
    window.clearInterval = (id) => {
      activeIntervals.delete(id);
      return originalClearInterval(id);
    };

    EventTarget.prototype.addEventListener = function patchedAdd(type, listener, options) {
      if ((this === window || this === document) && trackedTypes.has(type) && listener) {
        const key = listenerKey(this, type);
        let rows = listenerRecords.get(key);
        if (!rows) {
          rows = [];
          listenerRecords.set(key, rows);
        }
        const capture = captureValue(options);
        if (!rows.some((row) => row.listener === listener && row.capture === capture)) {
          rows.push({ listener, capture });
        }
      }
      return originalAdd.call(this, type, listener, options);
    };

    EventTarget.prototype.removeEventListener = function patchedRemove(type, listener, options) {
      if ((this === window || this === document) && trackedTypes.has(type) && listener) {
        const key = listenerKey(this, type);
        const rows = listenerRecords.get(key);
        if (rows) {
          const capture = captureValue(options);
          const index = rows.findIndex((row) => row.listener === listener && row.capture === capture);
          if (index >= 0) rows.splice(index, 1);
          if (!rows.length) listenerRecords.delete(key);
        }
      }
      return originalRemove.call(this, type, listener, options);
    };

    window.__csRuntimeProbe = {
      snapshot() {
        const listeners = {};
        let listenerTotal = 0;
        for (const [key, rows] of listenerRecords.entries()) {
          listeners[key] = rows.length;
          listenerTotal += rows.length;
        }
        return {
          activeRafs: activeRafs.size,
          activeIntervals: activeIntervals.size,
          listenerTotal,
          listeners,
        };
      },
    };
  });
}

async function runtimeSnapshot(page) {
  return page.evaluate(() => window.__csRuntimeProbe.snapshot());
}

async function setRenderer(page, renderer) {
  const warRoom = page.locator('[data-board3d-war-room="true"]');
  const appearance = await warRoom.count()
    ? page.getByRole('button', { name: 'Apariencia', exact: true })
    : page.getByRole('button', { name: 'Cambiar apariencia y piezas del tablero', exact: true });

  await expect(appearance).toBeVisible({ timeout: WAR_ROOM_READY_TIMEOUT });
  await appearance.click();

  const dialog = page.getByRole('dialog', { name: 'Ajustes' });
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await dialog.getByRole('radio', { name: new RegExp(`${renderer}$`) }).click();
  const close = dialog.getByRole('button', { name: 'Cerrar', exact: true });
  await expect(close).toBeVisible();
  await close.evaluate((element) => element.click());
  await expect(dialog).toBeHidden({ timeout: 15_000 });
}

async function expectReturnedToBaseline(page, baseline) {
  await expect.poll(async () => {
    const current = await runtimeSnapshot(page);
    return {
      activeIntervals: current.activeIntervals,
      listenerTotal: current.listenerTotal,
      listeners: current.listeners,
    };
  }, { timeout: 5_000, intervals: [100, 200, 400] }).toEqual({
    activeIntervals: baseline.activeIntervals,
    listenerTotal: baseline.listenerTotal,
    listeners: baseline.listeners,
  });

  await expect.poll(async () => (await runtimeSnapshot(page)).activeRafs, {
    timeout: 5_000,
    intervals: [100, 200, 400],
  }).toBeLessThanOrEqual(baseline.activeRafs + 1);
}

function movePosts(requestLog) {
  return requestLog.filter((entry) => entry.method === 'POST' && /\/games\/[^/]+\/move$/.test(entry.path));
}

async function installInterruptedMoveRoute(page, requestLog) {
  await page.route('http://localhost:4000/api/games/*/move', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const url = new URL(route.request().url());
    const id = url.pathname.match(/\/games\/([^/]+)\/move$/)?.[1] || 'e2e-game-1';
    const payload = route.request().postDataJSON?.() ?? {};
    requestLog.push({ method: 'POST', path: url.pathname });

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
      body: JSON.stringify({ detail: `War Room interruption E2E no simula ${payload.from || '?'}-${payload.to || '?'}` }),
    });
  });
}

test('War Room · runtime marathon no acumula canvas, RAF, intervals ni listeners globales', async ({ page }) => {
  test.setTimeout(360_000);
  await installRuntimeProbe(page);
  await page.setViewportSize({ width: 1440, height: 960 });
  await mockApi(page);
  await login(page);

  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expect(page.locator('[data-board3d-war-room="true"]')).toBeVisible({ timeout: WAR_ROOM_READY_TIMEOUT });
  await expect(page.locator('.board3d-main-canvas')).toHaveCount(1, { timeout: WAR_ROOM_READY_TIMEOUT });

  await setRenderer(page, '2D');
  await expect(page.locator('.board3d-main-canvas')).toHaveCount(0);
  await page.waitForTimeout(300);
  const baseline = await runtimeSnapshot(page);
  console.log(`War Room marathon baseline ${JSON.stringify(baseline)}`);

  for (let cycle = 1; cycle <= CYCLES; cycle += 1) {
    await setRenderer(page, '3D');
    await expect(page.locator('[data-board3d-war-room="true"]')).toBeVisible({ timeout: WAR_ROOM_READY_TIMEOUT });
    await expect(page.locator('.board3d-main-canvas')).toHaveCount(1, { timeout: WAR_ROOM_READY_TIMEOUT });

    await setRenderer(page, '2D');
    await expect(page.locator('.board3d-main-canvas')).toHaveCount(0);
    await expectReturnedToBaseline(page, baseline);
    console.log(`War Room marathon cycle ${cycle}/${CYCLES} ${JSON.stringify(await runtimeSnapshot(page))}`);
  }

  await setRenderer(page, '3D');
  await expect(page.locator('.board3d-main-canvas')).toHaveCount(1, { timeout: WAR_ROOM_READY_TIMEOUT });
});

test('War Room · cortar jugadas 3D con cambio de renderer reconcilia limpio y sigue jugable', async ({ page }) => {
  test.setTimeout(180_000);
  const requestLog = [];

  await installRuntimeProbe(page);
  await page.setViewportSize({ width: 1440, height: 960 });
  await mockApi(page, { requestLog });
  await installInterruptedMoveRoute(page, requestLog);
  await login(page);

  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();

  const board3d = page.locator('[data-board3d-war-room="true"]');
  const canvas = page.locator('.board3d-main-canvas');
  await expect(board3d).toBeVisible({ timeout: WAR_ROOM_READY_TIMEOUT });
  await expect(canvas).toHaveCount(1, { timeout: WAR_ROOM_READY_TIMEOUT });

  // La respuesta actualiza el FEN y arranca la animación 3D. Cortamos en cuanto
  // vemos el POST, antes de esperar a que la pieza termine físicamente su viaje.
  await clickBoardMove(page, 'e2', 'e4');
  await expect.poll(() => movePosts(requestLog).length, { timeout: 5_000 }).toBe(1);
  await setRenderer(page, '2D');
  await expect(canvas).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Casilla e4, peón blanco/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Casilla d5, peón negro/i })).toBeVisible();
  await expect(page.locator('.error-boundary-screen')).toHaveCount(0);

  await page.waitForTimeout(250);
  const interruptedBaseline = await runtimeSnapshot(page);

  // Volver a 3D debe reconstruir desde el estado común, no continuar pose/ghost
  // del renderer desmontado. La captura posterior acredita que el input también
  // quedó reconciliado y no sólo que reapareció un canvas bonito.
  await setRenderer(page, '3D');
  await expect(board3d).toBeVisible({ timeout: WAR_ROOM_READY_TIMEOUT });
  await expect(canvas).toHaveCount(1, { timeout: WAR_ROOM_READY_TIMEOUT });
  await expect(board3d).toHaveAttribute('data-board3d-selected', '');

  await clickBoardMove(page, 'e4', 'd5');
  await expect.poll(() => movePosts(requestLog).length, { timeout: 5_000 }).toBe(2);
  await setRenderer(page, '2D');
  await expect(canvas).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Casilla d5, peón blanco/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Casilla f6, caballo negro/i })).toBeVisible();
  await expect(page.locator('.error-boundary-screen')).toHaveCount(0);
  await expectReturnedToBaseline(page, interruptedBaseline);

  await setRenderer(page, '3D');
  await expect(board3d).toBeVisible({ timeout: WAR_ROOM_READY_TIMEOUT });
  await expect(canvas).toHaveCount(1, { timeout: WAR_ROOM_READY_TIMEOUT });
  await expect(page.locator('.error-boundary-screen')).toHaveCount(0);
});
