import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { login, mockApi } from './helpers.js';

const ARTIFACT_DIR = '../.artifacts/app-visual';

function attachRuntimeErrorProbe(page) {
  const faults = [];
  const httpErrors = [];

  page.on('pageerror', (error) => {
    faults.push({ type:'pageerror', message:String(error?.stack || error?.message || error) });
  });

  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const location = message.location();
    faults.push({
      type:'console.error',
      message:message.text(),
      url:location?.url || null,
      lineNumber:location?.lineNumber ?? null,
      columnNumber:location?.columnNumber ?? null,
    });
  });

  page.on('response', (response) => {
    if (response.status() < 400) return;
    httpErrors.push({ status:response.status(), url:response.url() });
  });

  return { faults, httpErrors };
}

async function installLifecycleProbe(page) {
  await page.addInitScript(() => {
    const activeIntervals = new Set();
    const activeRafs = new Set();
    const listeners = { window:0, document:0 };
    const listenerRegistry = new WeakMap();

    const nativeSetInterval = window.setInterval.bind(window);
    const nativeClearInterval = window.clearInterval.bind(window);
    const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
    const nativeCancelAnimationFrame = window.cancelAnimationFrame.bind(window);
    const nativeAddEventListener = EventTarget.prototype.addEventListener;
    const nativeRemoveEventListener = EventTarget.prototype.removeEventListener;

    window.setInterval = (handler, timeout, ...args) => {
      const id = nativeSetInterval(handler, timeout, ...args);
      activeIntervals.add(id);
      return id;
    };
    window.clearInterval = (id) => {
      activeIntervals.delete(id);
      return nativeClearInterval(id);
    };

    window.requestAnimationFrame = (callback) => {
      let id = 0;
      id = nativeRequestAnimationFrame((timestamp) => {
        activeRafs.delete(id);
        callback(timestamp);
      });
      activeRafs.add(id);
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      activeRafs.delete(id);
      return nativeCancelAnimationFrame(id);
    };

    EventTarget.prototype.addEventListener = function(type, listener, options) {
      if (listener && (this === window || this === document)) {
        const capture = typeof options === 'boolean' ? options : Boolean(options?.capture);
        const once = typeof options === 'object' && Boolean(options?.once);
        const signal = typeof options === 'object' ? options?.signal : null;
        if (!once && !signal) {
          const target = this === window ? 'window' : 'document';
          const key = `${target}:${type}:${capture ? 1 : 0}`;
          let keys = listenerRegistry.get(listener);
          if (!keys) {
            keys = new Set();
            listenerRegistry.set(listener, keys);
          }
          if (!keys.has(key)) {
            keys.add(key);
            listeners[target] += 1;
          }
        }
      }
      return nativeAddEventListener.call(this, type, listener, options);
    };

    EventTarget.prototype.removeEventListener = function(type, listener, options) {
      if (listener && (this === window || this === document)) {
        const capture = typeof options === 'boolean' ? options : Boolean(options?.capture);
        const target = this === window ? 'window' : 'document';
        const key = `${target}:${type}:${capture ? 1 : 0}`;
        const keys = listenerRegistry.get(listener);
        if (keys?.delete(key)) listeners[target] = Math.max(0, listeners[target] - 1);
      }
      return nativeRemoveEventListener.call(this, type, listener, options);
    };

    window.__chessLifecycleProbe = {
      snapshot() {
        return {
          intervals:activeIntervals.size,
          rafs:activeRafs.size,
          windowListeners:listeners.window,
          documentListeners:listeners.document,
          runningAnimations:document.getAnimations().filter((animation) => animation.playState === 'running').length,
        };
      },
    };
  });
}

async function settle(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(250);
}

async function seedRuntimeSession(page) {
  await mockApi(page, {
    profileSeed: {
      'matthias.onboarded': '2',
      'chess-study-home-guide-dismissed-v1': '1',
    },
  });
  // mockApi intercepta /api/** pero todavía no modela este endpoint real del backend.
  // La ruta específica se registra después para que Playwright la priorice sobre el wildcard.
  await page.route('http://localhost:4000/api/client-telemetry', (route) => route.fulfill({ status:204, body:'' }));
}

test('Browser runtime · Home y Así juegas no dejan errores silenciosos', async ({ page }) => {
  await mkdir(ARTIFACT_DIR, { recursive:true });
  const { faults, httpErrors } = attachRuntimeErrorProbe(page);
  const stages = [];

  await seedRuntimeSession(page);
  await login(page);

  const home = page.getByRole('region', { name:'Modos principales' });
  await expect(home).toBeVisible();
  await expect(home.locator('.illustrated-home__stage')).toBeVisible();
  await settle(page);
  stages.push({ name:'home', faultCount:faults.length, httpErrorCount:httpErrors.length });

  const matthias = home.getByRole('button', { name:'Abrir Así juegas con Matthias', exact:true });
  await expect(matthias).toBeVisible();
  await matthias.click();
  await expect(page.getByRole('heading', { name:'Así juegas', exact:true })).toBeVisible();
  await settle(page);
  stages.push({ name:'asi-juegas', faultCount:faults.length, httpErrorCount:httpErrors.length });

  await writeFile(
    `${ARTIFACT_DIR}/browser-runtime-health.json`,
    `${JSON.stringify({ schema:2, stages, faults, httpErrors }, null, 2)}\n`,
    'utf8',
  );

  const diagnostic = [
    ...faults.map((fault) => `[${fault.type}] ${fault.message}${fault.url ? ` @ ${fault.url}` : ''}`),
    ...httpErrors.map((fault) => `[http ${fault.status}] ${fault.url}`),
  ].join('\n\n');
  expect(faults, diagnostic).toEqual([]);
});

test('Browser lifecycle · abrir y cerrar Así juegas no acumula recursos globales', async ({ page }) => {
  await mkdir(ARTIFACT_DIR, { recursive:true });
  await installLifecycleProbe(page);
  await seedRuntimeSession(page);
  await login(page);

  const home = page.getByRole('region', { name:'Modos principales' });
  const homeStage = home.locator('.illustrated-home__stage');
  const matthias = home.getByRole('button', { name:'Abrir Así juegas con Matthias', exact:true });
  await expect(homeStage).toBeVisible();
  await settle(page);

  const snapshot = () => page.evaluate(() => window.__chessLifecycleProbe.snapshot());
  const baseline = await snapshot();
  const cycles = [];

  for (let cycle = 1; cycle <= 3; cycle += 1) {
    await matthias.click();
    await expect(page.getByRole('heading', { name:'Así juegas', exact:true })).toBeVisible();
    await settle(page);
    const mounted = await snapshot();

    await page.keyboard.press('Escape');
    await expect(homeStage).toBeVisible();
    await settle(page);
    const unmounted = await snapshot();
    cycles.push({ cycle, mounted, unmounted });
  }

  const final = cycles.at(-1).unmounted;
  await writeFile(
    `${ARTIFACT_DIR}/browser-lifecycle-health.json`,
    `${JSON.stringify({ schema:1, baseline, cycles, final }, null, 2)}\n`,
    'utf8',
  );

  expect(final.intervals, `intervals: ${JSON.stringify({ baseline, final })}`).toBeLessThanOrEqual(baseline.intervals);
  expect(final.windowListeners, `window listeners: ${JSON.stringify({ baseline, final })}`).toBeLessThanOrEqual(baseline.windowListeners);
  expect(final.documentListeners, `document listeners: ${JSON.stringify({ baseline, final })}`).toBeLessThanOrEqual(baseline.documentListeners);
  expect(final.rafs, `RAF pendientes: ${JSON.stringify({ baseline, final })}`).toBeLessThanOrEqual(baseline.rafs + 1);
});
