import { expect, test } from '@playwright/test';
import {
  activateSetupControl,
  buttonWithVisibleText,
  login,
  mockApi,
} from './helpers.js';
import { readBoard3DProjection } from './board3d-projection.js';

const VARIANT_KEY = 'chess-study-war-room-variant-v1';
const READY_TIMEOUT = 90_000;

function movePosts(log) {
  return log.filter((entry) => entry.method === 'POST' && /\/games\/[^/]+\/move$/.test(entry.path));
}

async function leaveGame(page) {
  await page.getByRole('button', { name: 'Salir de la partida', exact: true }).click();
  await expect(page.getByRole('heading', { name: '¿Abandonar la partida?', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar sin penalización', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Modos principales', exact: true })).toBeVisible({ timeout: 30_000 });
}


/**
 * Observe actual GLB requests without changing cache policy or buffering the
 * response in JS. CDP's encodedDataLength is wire traffic (including protocol
 * overhead), NOT decoded model bytes, GPU memory, or a hardware GPU benchmark.
 * Each Playwright test starts in a fresh browser context: first visit is cold;
 * the return to the room is warm in the same browser/cache context.
 */
async function installRuntimeGlbProbe(page, variant) {
  const cdp = await page.context().newCDPSession(page);
  const requests = new Map();
  let currentVisit = 'cold';
  const relevant = (url) => url.includes(`/war-room/${variant}/`) && /\.glb(?:[?#]|$)/.test(url);

  cdp.on('Network.requestWillBeSent', ({ requestId, request, initiator, timestamp }) => {
    if (!relevant(request.url)) return;
    requests.set(requestId, {
      visit: currentVisit,
      url: request.url,
      initiator: initiator?.type || 'unknown',
      startedAt: timestamp,
      elapsedMs: null,
      encodedBytes: null,
      cacheHit: false,
      status: null,
      cacheControl: null,
      ageSeconds: null,
      failed: false,
    });
  });
  cdp.on('Network.responseReceived', ({ requestId, response }) => {
    const entry = requests.get(requestId);
    if (!entry) return;
    entry.status = response.status;
    const headers = Object.fromEntries(
      Object.entries(response.headers || {}).map(([name, value]) => [name.toLowerCase(), value]),
    );
    entry.cacheControl = headers['cache-control'] || null;
    entry.ageSeconds = headers.age === undefined ? null : Number(headers.age);
    entry.cacheHit ||= response.fromDiskCache === true || response.fromPrefetchCache === true;
  });
  cdp.on('Network.requestServedFromCache', ({ requestId }) => {
    const entry = requests.get(requestId);
    if (entry) entry.cacheHit = true;
  });
  cdp.on('Network.loadingFinished', ({ requestId, encodedDataLength, timestamp }) => {
    const entry = requests.get(requestId);
    if (!entry) return;
    entry.encodedBytes = Math.max(0, Math.round(encodedDataLength || 0));
    entry.elapsedMs = Math.round(Math.max(0, timestamp - entry.startedAt) * 1000);
  });
  cdp.on('Network.loadingFailed', ({ requestId }) => {
    const entry = requests.get(requestId);
    if (entry) entry.failed = true;
  });
  await cdp.send('Network.enable');

  return {
    begin(visit) { currentVisit = visit; },
    snapshot(visit) {
      const matches = [...requests.values()].filter((entry) => entry.visit === visit);
      return {
        requestCount: matches.length,
        cacheHits: matches.filter((entry) => entry.cacheHit).length,
        transferredBytes: matches.reduce((sum, entry) => sum + (entry.encodedBytes || 0), 0),
        failedRequests: matches.filter((entry) => entry.failed).length,
        urls: [...new Set(matches.map((entry) => entry.url))],
        requests: matches.map(({ initiator, status, cacheControl, ageSeconds, cacheHit, encodedBytes, elapsedMs }) => ({
          initiator, status, cacheControl, ageSeconds, cacheHit, encodedBytes, elapsedMs,
        })),
      };
    },
    close: () => cdp.detach(),
  };
}

async function enterAndMeasure(page, requestLog, variant, visit, assetProbe) {
  assetProbe?.begin(visit);
  await buttonWithVisibleText(page, 'Partida rápida').click();
  const start = await page.evaluate(() => performance.now());
  await activateSetupControl(page.getByRole('button', { name: 'Empezar partida', exact: true }));

  const board = page.locator('[data-board3d-war-room="true"]');
  const canvas = page.locator('.board3d-main-canvas');
  await expect(board).toBeVisible({ timeout: READY_TIMEOUT });
  await expect(canvas).toBeVisible({ timeout: READY_TIMEOUT });
  const firstFrame = await page.evaluate((t0) => performance.now() - t0, start);

  await expect(board).toHaveAttribute('data-board3d-variant', variant, { timeout: READY_TIMEOUT });
  await expect(board).toHaveAttribute('data-board3d-variant-status', 'ready', { timeout: READY_TIMEOUT });
  const shellReady = await page.evaluate((t0) => performance.now() - t0, start);

  const beforeMoves = movePosts(requestLog).length;
  const projection = await readBoard3DProjection(canvas);
  const from = projection.square('e2');
  const to = projection.square('e4');
  await page.mouse.click(from.x, from.y);
  await expect(board).toHaveAttribute('data-board3d-selected', 'e2', { timeout: 5_000 });
  await page.mouse.click(to.x, to.y);
  await expect.poll(() => movePosts(requestLog).length, { timeout: 15_000 }).toBe(beforeMoves + 1);
  const interactive = await page.evaluate((t0) => performance.now() - t0, start);

  const hansStage = await canvas.getAttribute('data-war-room-hans-stage');
  const memory = await canvas.evaluate((element) => ({
    geometries: Number(element.dataset.board3dMemoryGeometries || 0),
    textures: Number(element.dataset.board3dMemoryTextures || 0),
    programs: Number(element.dataset.board3dMemoryPrograms || 0),
  }));

  // Diagnostics are emitted once per shell phase, and are not CPU-clock
  // measurements. This separates GLB transfer/parse, material setup,
  // effects install and the synchronous ready paint.
  const shellPhases = await canvas.evaluate((element) => {
    const names = ['import', 'glb', 'materials', 'effects', 'render', 'postRender', 'readyPaint'];
    return Object.fromEntries(names.map((phase) => {
      const key = `warRoomShellTiming${phase[0].toUpperCase()}${phase.slice(1)}Ms`;
      const raw = element.dataset[key];
      return [phase, raw === undefined ? null : Number(raw)];
    }));
  });

  const prefetchHref = await page.evaluate((id) => (
    document.querySelector(`link[data-war-room-prefetch="${id}"]`)?.href || null
  ), variant);
  const runtimeAsset = assetProbe?.snapshot(visit) || null;

  const row = {
    variant,
    visit,
    prefetchHref,
    runtimeAsset,
    shellPhases,
    firstFrameMs: Math.round(firstFrame),
    shellReadyMs: Math.round(shellReady),
    interactiveMs: Math.round(interactive),
    hansStage,
    memory,
  };
  console.log(`War Room entry latency ${JSON.stringify(row)}`);
  expect(row.interactiveMs).toBeGreaterThanOrEqual(row.shellReadyMs);
  return row;
}

for (const variant of ['v3', 'v4']) {
  test(`War Room · ${variant} mide entrada cold y warm hasta primera jugada real`, async ({ page }) => {
    test.setTimeout(300_000);
    const requestLog = [];

    await page.addInitScript(({ key, value }) => {
      window.localStorage.setItem(key, value);
    }, { key: VARIANT_KEY, value: variant });

    await mockApi(page, {
      requestLog,
      profileSeed: {
        [VARIANT_KEY]: variant,
        'matthias.onboarded': '2',
        'chess-study-home-guide-dismissed-v1': '1',
        'chess-study-mechanic-tutorial-progress-v1': JSON.stringify({
          'war-room-basics': { seen: true },
        }),
      },
    });
    // Listen before Home appears: pointer/intent prefetch can start while
    // login finishes, and cold bytes must include that earliest GLB request.
    // CDP is Chromium-only; other projects retain the latency assertions.
    const assetProbe = test.info().project.name === 'chromium'
      ? await installRuntimeGlbProbe(page, variant)
      : null;
    await login(page);

    let cold;
    let warm;
    try {
      cold = await enterAndMeasure(page, requestLog, variant, 'cold', assetProbe);
      await leaveGame(page);
      warm = await enterAndMeasure(page, requestLog, variant, 'warm', assetProbe);
    } finally {
      await assetProbe?.close();
    }

    if (assetProbe) {
      // Guard both immutable manifest URLs (#5717 V3, new V4); any mutable
      // current.glb fetch repeats bytes already warmed by intent prefetch.
      expect(cold.runtimeAsset.requestCount).toBeGreaterThan(0);
      const hashedRoom = new RegExp(`/war-room/${variant}/runtime/[^/?#]+-[a-f0-9]{16}\\.glb(?:[?#]|$)`);
      expect(cold.runtimeAsset.urls.every((url) => hashedRoom.test(url))).toBe(true);
      if (cold.prefetchHref) {
        expect(cold.runtimeAsset.urls).toEqual([cold.prefetchHref]);
      }
      if (warm.runtimeAsset.urls.length && warm.prefetchHref) {
        expect(warm.runtimeAsset.urls).toEqual([warm.prefetchHref]);
      }
    }

    // Diagnostic baseline only: do not invent latency budgets before hardware
    // and software-rendered numbers are observed. Guard only against session
    // degradation: the second visit must stay within a generous 25% + 1 s.
    expect(warm.interactiveMs).toBeLessThanOrEqual(Math.round(cold.interactiveMs * 1.25 + 1000));
  });
}
