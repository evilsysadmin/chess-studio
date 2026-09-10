import { expect, test } from '@playwright/test';
import { buttonWithVisibleText, login, mockApi } from './helpers.js';

const WAR_ROOM_READY_TIMEOUT = 45_000;

async function installWarRoomLifecycleProbe(page) {
  await page.addInitScript(() => {
    const TRACKED_CANVAS_EVENTS = new Set([
      'pointerdown',
      'pointermove',
      'pointerleave',
      'pointerup',
      'pointercancel',
      'webglcontextlost',
      'warroom-hans-call-release',
    ]);

    let nextTargetId = 1;
    let nextListenerId = 1;
    const targetIds = new WeakMap();
    const listenerIds = new WeakMap();
    const activeCanvasListeners = new Set();

    const targetId = (target) => {
      if (!targetIds.has(target)) targetIds.set(target, nextTargetId++);
      return targetIds.get(target);
    };
    const listenerId = (listener) => {
      if (!listener || (typeof listener !== 'function' && typeof listener !== 'object')) return String(listener);
      if (!listenerIds.has(listener)) listenerIds.set(listener, nextListenerId++);
      return listenerIds.get(listener);
    };
    const listenerKey = (target, type, listener, options) => {
      const capture = typeof options === 'boolean' ? options : Boolean(options?.capture);
      return `${targetId(target)}:${type}:${listenerId(listener)}:${capture ? 1 : 0}`;
    };
    const isWarRoomCanvas = (target) => target?.classList?.contains?.('board3d-main-canvas');

    const originalAdd = HTMLCanvasElement.prototype.addEventListener;
    const originalRemove = HTMLCanvasElement.prototype.removeEventListener;
    HTMLCanvasElement.prototype.addEventListener = function patchedAdd(type, listener, options) {
      if (isWarRoomCanvas(this) && TRACKED_CANVAS_EVENTS.has(type)) {
        activeCanvasListeners.add(listenerKey(this, type, listener, options));
      }
      return originalAdd.call(this, type, listener, options);
    };
    HTMLCanvasElement.prototype.removeEventListener = function patchedRemove(type, listener, options) {
      if (isWarRoomCanvas(this) && TRACKED_CANVAS_EVENTS.has(type)) {
        activeCanvasListeners.delete(listenerKey(this, type, listener, options));
      }
      return originalRemove.call(this, type, listener, options);
    };

    let activeWarRoomResizeObservers = 0;
    const NativeResizeObserver = window.ResizeObserver;
    if (typeof NativeResizeObserver === 'function') {
      window.ResizeObserver = class AuditedResizeObserver extends NativeResizeObserver {
        constructor(callback) {
          super(callback);
          this.__warRoomTargets = new Set();
        }

        observe(target, options) {
          if (target?.classList?.contains?.('board3d-main-host') && !this.__warRoomTargets.has(target)) {
            this.__warRoomTargets.add(target);
            activeWarRoomResizeObservers += 1;
          }
          return super.observe(target, options);
        }

        unobserve(target) {
          if (this.__warRoomTargets.delete(target)) activeWarRoomResizeObservers -= 1;
          return super.unobserve(target);
        }

        disconnect() {
          activeWarRoomResizeObservers -= this.__warRoomTargets.size;
          this.__warRoomTargets.clear();
          return super.disconnect();
        }
      };
    }

    window.__warRoomLifecycleAudit = {
      snapshot() {
        return {
          canvases: document.querySelectorAll('.board3d-main-canvas').length,
          canvasListeners: activeCanvasListeners.size,
          resizeObservers: activeWarRoomResizeObservers,
        };
      },
    };
  });
}

async function snapshot(page) {
  return page.evaluate(() => window.__warRoomLifecycleAudit.snapshot());
}

async function waitFor3D(page) {
  const board = page.locator('[data-board3d-war-room="true"]');
  const canvas = page.locator('.board3d-main-canvas');
  await expect(board).toBeVisible({ timeout: WAR_ROOM_READY_TIMEOUT });
  await expect(canvas).toBeVisible({ timeout: WAR_ROOM_READY_TIMEOUT });
  await expect.poll(async () => (await snapshot(page)).canvases).toBe(1);
  return { board, canvas };
}

async function switchRenderer(page, renderer) {
  const warRoom = page.locator('[data-board3d-war-room="true"]');
  const appearance = await warRoom.count()
    ? page.getByRole('button', { name: 'Apariencia', exact: true })
    : page.getByRole('button', { name: 'Cambiar apariencia y piezas del tablero', exact: true });

  await expect(appearance).toBeVisible({ timeout: WAR_ROOM_READY_TIMEOUT });
  await appearance.evaluate((element) => element.click());

  const dialog = page.getByRole('dialog', { name: 'Ajustes' });
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await dialog.getByRole('radio', { name: new RegExp(`${renderer}$`) }).click();
  const close = dialog.getByRole('button', { name: 'Cerrar', exact: true });
  await expect(close).toBeVisible();
  await close.evaluate((element) => element.click());
  await expect(dialog).toBeHidden({ timeout: 15_000 });
}

function expectSameLifecycleBaseline(actual, baseline) {
  expect(actual.canvases).toBe(1);
  expect(actual.canvasListeners).toBe(baseline.canvasListeners);
  expect(actual.resizeObservers).toBe(baseline.resizeObservers);
}

test('War Room · ciclos 3D↔2D no acumulan canvas, listeners ni ResizeObservers', async ({ page }) => {
  test.setTimeout(180_000);

  await installWarRoomLifecycleProbe(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApi(page);
  await login(page);
  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();

  await waitFor3D(page);
  const first3D = await snapshot(page);
  expect(first3D.canvases).toBe(1);
  expect(first3D.canvasListeners).toBeGreaterThan(0);
  expect(first3D.resizeObservers).toBeGreaterThan(0);

  for (let cycle = 0; cycle < 5; cycle += 1) {
    await switchRenderer(page, '2D');
    await expect(page.locator('.board3d-main-canvas')).toHaveCount(0, { timeout: 15_000 });
    await expect.poll(async () => snapshot(page)).toEqual({ canvases: 0, canvasListeners: 0, resizeObservers: 0 });

    await switchRenderer(page, '3D');
    await waitFor3D(page);
    await expect.poll(async () => snapshot(page)).toEqual(first3D);
    expectSameLifecycleBaseline(await snapshot(page), first3D);
  }
});
