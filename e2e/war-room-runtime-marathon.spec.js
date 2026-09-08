import { expect, test } from '@playwright/test';
import { buttonWithVisibleText, login, mockApi } from './helpers.js';

const WAR_ROOM_READY_TIMEOUT = 45_000;
const CYCLES = 12;

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

test('War Room · runtime marathon no acumula canvas, RAF, intervals ni listeners globales', async ({ page }) => {
  test.setTimeout(180_000);
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

  for (let cycle = 1; cycle <= CYCLES; cycle += 1) {
    await setRenderer(page, '3D');
    await expect(page.locator('[data-board3d-war-room="true"]')).toBeVisible({ timeout: WAR_ROOM_READY_TIMEOUT });
    await expect(page.locator('.board3d-main-canvas')).toHaveCount(1, { timeout: WAR_ROOM_READY_TIMEOUT });

    await setRenderer(page, '2D');
    await expect(page.locator('.board3d-main-canvas')).toHaveCount(0);
    await expectReturnedToBaseline(page, baseline);
  }

  await setRenderer(page, '3D');
  await expect(page.locator('.board3d-main-canvas')).toHaveCount(1, { timeout: WAR_ROOM_READY_TIMEOUT });
});
