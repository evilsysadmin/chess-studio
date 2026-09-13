import { expect, test } from '@playwright/test';
import { login, mockApi, startQuickGame } from './helpers.js';

async function installGlobalResourceProbe(page) {
  await page.addInitScript(() => {
    const webglCanvases = new Set();
    const workers = new Set();
    const audioContexts = new Set();

    const nativeGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext(type, ...args) {
      const context = nativeGetContext.call(this, type, ...args);
      const kind = String(type || '').toLowerCase();
      if (context && (kind === 'webgl' || kind === 'webgl2' || kind === 'experimental-webgl')) {
        webglCanvases.add(this);
      }
      return context;
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
        return {
          canvases: document.querySelectorAll('canvas').length,
          webglCanvases: [...webglCanvases].filter((canvas) => canvas.isConnected).length,
          workers: workers.size,
          audioContexts: [...audioContexts].filter((context) => context.state !== 'closed').length,
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
  expect(final.workers, `Worker leak: ${JSON.stringify({ baseline, final })}`).toBeLessThanOrEqual(baseline.workers);

  // AudioContext has session ownership: one shared context may be lazily created
  // by the first game and intentionally survive while the authenticated session
  // remains alive. More than one live context after returning Home is a leak.
  expect(final.audioContexts, `AudioContext leak: ${JSON.stringify({ baseline, final })}`)
    .toBeLessThanOrEqual(Math.max(1, baseline.audioContexts));
}

test('Browser lifecycle · Home → War Room → Home no deja recursos gráficos o globales zombis', async ({ page }) => {
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

  await page.getByRole('button', { name: 'Salir al menú', exact: true }).click();
  await expect(page.getByRole('heading', { name: '¿Abandonar la partida?', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar sin penalización', exact: true }).click();
  await expect(home).toBeVisible();
  await settle(page);

  const final = await snapshot();
  expectReturnedResourcesToFitBaseline({ baseline, final });
});
