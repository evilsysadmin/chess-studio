import { expect, test } from '@playwright/test';
import { login, mockApi, openMoreGameModes, startQuickGame } from './helpers.js';

async function installGlobalResourceProbe(page) {
  await page.addInitScript(() => {
    const webglCanvases = new Set();
    const webglContexts = new Set();
    const workers = new Set();
    const audioContexts = new Set();
    const pendingAnimationFrames = new Set();
    const globalListeners = new Map([
      [window, new Map()],
      [document, new Map()],
    ]);

    const nativeGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext(type, ...args) {
      const context = nativeGetContext.call(this, type, ...args);
      const kind = String(type || '').toLowerCase();
      if (context && (kind === 'webgl' || kind === 'webgl2' || kind === 'experimental-webgl')) {
        webglCanvases.add(this);
        webglContexts.add(context);
      }
      return context;
    };

    const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
    const nativeCancelAnimationFrame = window.cancelAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => {
      let id = 0;
      id = nativeRequestAnimationFrame((time) => {
        pendingAnimationFrames.delete(id);
        callback(time);
      });
      pendingAnimationFrames.add(id);
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      pendingAnimationFrames.delete(id);
      nativeCancelAnimationFrame(id);
    };

    const nativeAddEventListener = EventTarget.prototype.addEventListener;
    const nativeRemoveEventListener = EventTarget.prototype.removeEventListener;
    const captureFor = (options) => typeof options === 'boolean' ? options : Boolean(options?.capture);
    const bucketFor = (target, type, capture) => {
      const targetRegistry = globalListeners.get(target);
      if (!targetRegistry) return null;
      const key = `${type}:${capture ? 1 : 0}`;
      if (!targetRegistry.has(key)) targetRegistry.set(key, new Map());
      return targetRegistry.get(key);
    };
    const forgetGlobalListener = (target, type, listener, capture, removeNative = false) => {
      const bucket = bucketFor(target, type, capture);
      const record = bucket?.get(listener);
      if (!record) return false;
      bucket.delete(listener);
      if (removeNative) nativeRemoveEventListener.call(target, type, record.wrapped, capture);
      if (record.signal && record.abortHandler) {
        nativeRemoveEventListener.call(record.signal, 'abort', record.abortHandler, false);
      }
      return true;
    };

    EventTarget.prototype.addEventListener = function addEventListener(type, listener, options) {
      const capture = captureFor(options);
      const bucket = bucketFor(this, type, capture);
      if (!bucket || listener == null || options?.signal?.aborted) {
        return nativeAddEventListener.call(this, type, listener, options);
      }
      if (bucket.has(listener)) return undefined;

      const once = typeof options === 'object' && options?.once === true;
      const signal = typeof options === 'object' ? options?.signal : null;
      const wrapped = function wrappedGlobalListener(event) {
        if (once) forgetGlobalListener(this, type, listener, capture, false);
        if (typeof listener === 'function') return listener.call(this, event);
        return listener?.handleEvent?.call(listener, event);
      };
      const record = { wrapped, signal, abortHandler: null };
      if (signal) {
        record.abortHandler = () => forgetGlobalListener(this, type, listener, capture, false);
        nativeAddEventListener.call(signal, 'abort', record.abortHandler, { once: true });
      }
      bucket.set(listener, record);
      return nativeAddEventListener.call(this, type, wrapped, options);
    };

    EventTarget.prototype.removeEventListener = function removeEventListener(type, listener, options) {
      const capture = captureFor(options);
      if (forgetGlobalListener(this, type, listener, capture, true)) return undefined;
      return nativeRemoveEventListener.call(this, type, listener, options);
    };

    const NativeWorker = window.Worker;
    if (typeof NativeWorker === 'function') {
      window.Worker = new Proxy(NativeWorker, {
        construct(target, args, newTarget) {
          const worker = Reflect.construct(target, args, newTarget);
          workers.add(worker);
          const nativeTerminate = worker.terminate?.bind(worker);
          if (nativeTerminate) {
            worker.terminate = (...terminateArgs) => {
              workers.delete(worker);
              return nativeTerminate(...terminateArgs);
            };
          }
          return worker;
        },
      });
    }

    const wrappedAudioClasses = new Map();
    for (const name of ['AudioContext', 'webkitAudioContext']) {
      const NativeAudioContext = window[name];
      if (typeof NativeAudioContext !== 'function') continue;
      let WrappedAudioContext = wrappedAudioClasses.get(NativeAudioContext);
      if (!WrappedAudioContext) {
        WrappedAudioContext = new Proxy(NativeAudioContext, {
          construct(target, args, newTarget) {
            const context = Reflect.construct(target, args, newTarget);
            audioContexts.add(context);
            return context;
          },
        });
        wrappedAudioClasses.set(NativeAudioContext, WrappedAudioContext);
      }
      try {
        window[name] = WrappedAudioContext;
      } catch {
        // A hardened browser may expose a readonly alias. Instrument whichever
        // constructor remains writable instead of weakening the product test.
      }
    }

    window.__chessGlobalResourceProbe = {
      snapshot() {
        const listenerCount = (target) => [...globalListeners.get(target).values()]
          .reduce((total, bucket) => total + bucket.size, 0);
        const liveWebglContexts = [...webglContexts].filter((context) => {
          try {
            return typeof context.isContextLost !== 'function' || !context.isContextLost();
          } catch {
            return true;
          }
        }).length;
        return {
          canvases: document.querySelectorAll('canvas').length,
          webglCanvases: [...webglCanvases].filter((canvas) => canvas.isConnected).length,
          liveWebglContexts,
          workers: workers.size,
          audioContexts: [...audioContexts].filter((context) => context.state !== 'closed').length,
          pendingAnimationFrames: pendingAnimationFrames.size,
          windowListeners: listenerCount(window),
          documentListeners: listenerCount(document),
        };
      },
    };
  });
}

async function settle(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(250);
}

function expectReturnedResourcesToFitBaseline({ baseline, final }) {
  expect(final.canvases, `canvas leak: ${JSON.stringify({ baseline, final })}`).toBeLessThanOrEqual(baseline.canvases);
  expect(final.webglCanvases, `WebGL canvas leak: ${JSON.stringify({ baseline, final })}`).toBeLessThanOrEqual(baseline.webglCanvases);
  expect(final.liveWebglContexts, `live WebGL context leak: ${JSON.stringify({ baseline, final })}`)
    .toBeLessThanOrEqual(baseline.liveWebglContexts);
  expect(final.workers, `Worker leak: ${JSON.stringify({ baseline, final })}`).toBeLessThanOrEqual(baseline.workers);
  expect(final.pendingAnimationFrames, `RAF leak: ${JSON.stringify({ baseline, final })}`)
    .toBeLessThanOrEqual(baseline.pendingAnimationFrames);
  expect(final.windowListeners, `window listener leak: ${JSON.stringify({ baseline, final })}`)
    .toBeLessThanOrEqual(baseline.windowListeners);
  expect(final.documentListeners, `document listener leak: ${JSON.stringify({ baseline, final })}`)
    .toBeLessThanOrEqual(baseline.documentListeners);

  // AudioContext has session ownership: one shared context may be lazily created
  // by the first game and intentionally survive while the authenticated session
  // remains alive. More than one live context after returning Home is a leak.
  expect(final.audioContexts, `AudioContext leak: ${JSON.stringify({ baseline, final })}`)
    .toBeLessThanOrEqual(Math.max(1, baseline.audioContexts));
}

async function openPawnSlugFromHome(page) {
  const speech = page.getByRole('region', { name: 'Mensaje de Matthias', exact: true });
  if (await speech.isVisible().catch(() => false)) {
    const close = speech.getByRole('button', { name: 'Cerrar comentario de Matthias', exact: true });
    if (await close.isVisible().catch(() => false)) await close.click({ force: true });
  }

  await openMoreGameModes(page);
  const moreModes = page.locator('#illustrated-home-tools');
  await expect(moreModes).toBeVisible();
  await moreModes.getByRole('button').filter({ hasText: 'Experimentos geniales' }).click();
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Pawn Slug/ }).click();
  await expect(page.getByRole('heading', { name: 'PAWN SLUG GODOT', exact: true })).toBeVisible();
}

test('Browser lifecycle · Home → War Room → Home → Pawn Slug → Home no acumula recursos globales', async ({ page }) => {
  test.setTimeout(150_000);
  await installGlobalResourceProbe(page);
  await mockApi(page, {
    profileSeed: {
      'matthias.onboarded': '2',
      'chess-study-home-guide-dismissed-v1': '1',
    },
  });
  await login(page);

  const home = page.getByRole('region', { name: 'Modos principales', exact: true });
  await expect(home).toBeVisible();
  await settle(page);

  const snapshot = () => page.evaluate(() => window.__chessGlobalResourceProbe.snapshot());
  const baseline = await snapshot();

  await startQuickGame(page);
  await expect(page.locator('[data-board3d-war-room="true"]')).toBeVisible({ timeout: 30_000 });
  await settle(page);
  const warRoom = await snapshot();
  expect(warRoom.webglCanvases, `War Room debe acreditar al menos un canvas WebGL: ${JSON.stringify(warRoom)}`)
    .toBeGreaterThanOrEqual(1);
  expect(warRoom.liveWebglContexts, `War Room debe acreditar al menos un contexto WebGL vivo: ${JSON.stringify(warRoom)}`)
    .toBeGreaterThanOrEqual(1);

  await page.getByRole('button', { name: 'Salir al menú', exact: true }).click();
  await expect(page.getByRole('heading', { name: '¿Abandonar la partida?', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar sin penalización', exact: true }).click();
  await expect(home).toBeVisible();
  await settle(page);
  const afterWarRoom = await snapshot();
  expectReturnedResourcesToFitBaseline({ baseline, final: afterWarRoom });

  await openPawnSlugFromHome(page);
  const pawnSlugFrame = page.locator('iframe[title="Pawn Slug Godot"]');
  await expect(pawnSlugFrame).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-pawn-slug-renderer="three"]')).toHaveCount(0);
  await settle(page);

  const pawnSlugHost = await snapshot();
  expect(pawnSlugHost.webglCanvases, `Pawn Slug Godot no debe reintroducir canvas Three en el shell: ${JSON.stringify(pawnSlugHost)}`)
    .toBeLessThanOrEqual(afterWarRoom.webglCanvases);

  await page.getByRole('button', { name: '← Experimentos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '← Volver al menú', exact: true }).click();
  await expect(home).toBeVisible();
  await settle(page);

  const final = await snapshot();
  expectReturnedResourcesToFitBaseline({ baseline, final });
});
