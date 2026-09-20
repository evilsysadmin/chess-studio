import { createServer } from 'node:http';
import { createRequire } from 'node:module';

const requireFromE2e = createRequire(new URL('../e2e/package.json', import.meta.url));
const { chromium } = requireFromE2e('playwright');

const indexUrl = String(process.env.PAWN_SLUG_GODOT_INDEX_URL || '').trim();
if (!indexUrl) throw new Error('PAWN_SLUG_GODOT_INDEX_URL is required');

const parsedIndex = new URL(indexUrl);
if (parsedIndex.protocol !== 'https:') throw new Error(`Godot smoke requires HTTPS: ${indexUrl}`);

const LIMIT = 40;
// The Godot "ready" event intentionally waits for Matthias' canonical remote
// atlas to be installed. R2 + PNG decode can legitimately cross 12s on a cold
// browser/runner, while engine, canvas, network and page health are already
// proven independently above. Keep the readiness gate strict but non-flaky.
const READY_BRIDGE_TIMEOUT_MS = 30_000;
const clip = (value, max = 500) => String(value ?? '').slice(0, max);
const pushBounded = (list, value) => {
  list.push(value);
  if (list.length > LIMIT) list.shift();
};

function isIgnorableRequestFailure(request) {
  try {
    const url = new URL(request.url());
    return request.method() === 'POST'
      && url.pathname === '/cdn-cgi/rum'
      && String(request.failure()?.errorText || '').includes('ERR_ABORTED');
  } catch {
    return false;
  }
}

function attachDiagnostics(page, label, diagnostics) {
  page.on('console', (message) => {
    pushBounded(diagnostics.console, { label, type: message.type(), text: clip(message.text()) });
  });
  page.on('pageerror', (error) => {
    pushBounded(diagnostics.pageErrors, { label, message: clip(error?.message || error) });
  });
  page.on('requestfailed', (request) => {
    if (isIgnorableRequestFailure(request)) return;
    pushBounded(diagnostics.requestFailures, {
      label,
      method: request.method(),
      url: request.url(),
      error: clip(request.failure()?.errorText || 'unknown'),
    });
  });
  page.on('response', (response) => {
    if (response.status() < 400) return;
    pushBounded(diagnostics.badResponses, { label, status: response.status(), url: response.url() });
  });
}

async function installMessageProbe(page) {
  await page.addInitScript(() => {
    window.__pawnSlugGodotMessages = [];
    window.addEventListener('message', (event) => {
      const data = event.data;
      let safeData = null;
      try {
        safeData = JSON.parse(JSON.stringify(data));
      } catch {
        safeData = String(data);
      }
      window.__pawnSlugGodotMessages.push({
        origin: event.origin,
        sourceIsWindow: event.source === window,
        data: safeData,
      });
      if (window.__pawnSlugGodotMessages.length > 40) window.__pawnSlugGodotMessages.shift();
    });
  });
}

async function snapshotFrame(frame) {
  try {
    return await frame.evaluate(() => {
      const canvas = document.querySelector('canvas');
      const status = document.getElementById('status');
      const notice = document.getElementById('status-notice');
      let webgl2 = null;
      try {
        const probe = document.createElement('canvas');
        webgl2 = Boolean(probe.getContext('webgl2'));
      } catch {
        webgl2 = false;
      }
      return {
        href: location.href,
        readyState: document.readyState,
        secureContext: window.isSecureContext,
        crossOriginIsolated: window.crossOriginIsolated,
        webgl2,
        statusPresent: Boolean(status),
        statusVisibility: status ? getComputedStyle(status).visibility : null,
        notice: notice ? String(notice.textContent || '').trim().slice(0, 800) : '',
        bodyText: String(document.body?.innerText || '').trim().slice(0, 1200),
        canvas: canvas ? {
          width: canvas.width,
          height: canvas.height,
          clientWidth: canvas.clientWidth,
          clientHeight: canvas.clientHeight,
          display: getComputedStyle(canvas).display,
          visibility: getComputedStyle(canvas).visibility,
        } : null,
        messages: Array.isArray(window.__pawnSlugGodotMessages) ? window.__pawnSlugGodotMessages : [],
      };
    });
  } catch (error) {
    return { evaluationError: clip(error?.message || error), url: frame.url() };
  }
}

function fail(stage, diagnostics) {
  throw new Error(`Pawn Slug Godot browser smoke failed at ${stage}\n${JSON.stringify(diagnostics, null, 2)}`);
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    if (!server?.listening) return resolve();
    server.close(() => resolve());
  });
}

async function bridgeCounts(page) {
  return page.evaluate(() => ({ ...(window.__pawnSlugGodotEventCounts || {}) }));
}

async function waitForBridgeCount(page, type, minimum = 1, timeout = 15_000) {
  await page.waitForFunction(
    ({ expectedType, expectedMinimum }) => (
      Number(window.__pawnSlugGodotEventCounts?.[expectedType] || 0) >= expectedMinimum
    ),
    { expectedType: type, expectedMinimum: minimum },
    { timeout },
  );
}

async function gameplayAutopilot(parent, canvas, diagnostics) {
  await canvas.click();
  await parent.evaluate(() => {
    window.__pawnSlugGodotEventCounts = {};
  });

  const keyboard = parent.keyboard;
  let counts = {};

  // Phase 1 follows the authored opening route. Industrial Front now starts
  // with a crouch-only low catwalk (roughly x=420..610), followed by a crate.
  // The old "run + periodic jump" bot could never pass that tunnel and would
  // sit there getting shot until the pickup assertion failed.
  await keyboard.down('ArrowRight');
  try {
    // Run up to the tunnel without wasting several seconds crouch-walking from
    // the spawn, then hold crouch long enough to clear the low ceiling.
    await parent.waitForTimeout(600);
    // Throw while Matthias is still inside OPENING_SAFE_UNTIL_X. The grenade
    // travels into the first pawn's lane while the bot crawls under the low
    // catwalk, preventing the smoke runner from being shot to death during the
    // deliberately slow crouch traversal.
    await keyboard.press('x');
    await parent.waitForTimeout(200);
    await keyboard.down('ArrowDown');
    await parent.waitForTimeout(3300);
    await keyboard.up('ArrowDown');

    // Clear the crate immediately after the tunnel, then stay mostly grounded
    // so the relocated first weapon pickup can be collected reliably.
    await parent.waitForTimeout(80);
    await keyboard.press('Space');
    for (let step = 0; step < 80; step += 1) {
      await parent.waitForTimeout(105);

      if (step % 4 === 0) {
        counts = await bridgeCounts(parent);
        if (counts['weapon-pickup'] || counts.gameover) break;
      }

      // Recovery hops only after the deterministic tunnel/crate sequence. This
      // keeps the bot resilient to small geometry changes without skipping the
      // ground-level pickup by bunny-hopping continuously.
      if (step > 18 && step % 10 === 4) await keyboard.press('Space');
    }
  } finally {
    await keyboard.up('ArrowDown').catch(() => {});
    await keyboard.up('ArrowRight');
  }

  counts = await bridgeCounts(parent);
  diagnostics.iframe.gameplayTraversal = counts;

  // Crossing the first weapon pickup proves world traversal/collision. The
  // player starts exactly on checkpoint 110, so requiring a checkpoint event
  // here would incorrectly force the bot to survive until checkpoint 1480.
  if (counts.gameover) fail('gameplay-gameover-before-pickup-contract', diagnostics);
  if (!counts['weapon-pickup']) fail('gameplay-weapon-pickup', diagnostics);
  if (!counts['weapon-changed']) fail('gameplay-weapon-change', diagnostics);

  // Phase 2 exercises combat inputs only after traversal has been proven.
  const grenadesBefore = Number(counts['grenade-thrown'] || 0);
  await keyboard.press('x');
  await waitForBridgeCount(parent, 'grenade-thrown', grenadesBefore + 1, 5_000);
  counts = await bridgeCounts(parent);
  diagnostics.iframe.gameplaySmoke = counts;
  if (Number(counts['grenade-thrown'] || 0) <= grenadesBefore) {
    fail('gameplay-grenade-input', diagnostics);
  }

  // Exercise the exact visual regression path: after the SMG pickup, keep
  // locomotion active while holding fire. Runtime health here protects the
  // moving-fire path without asking an unscripted bot to beat the campaign.
  await keyboard.down('ArrowRight');
  await keyboard.down('z');
  await parent.waitForTimeout(900);
  await keyboard.up('z');
  await keyboard.up('ArrowRight');

  diagnostics.iframe.gameplayAfterMovingFire = await bridgeCounts(parent);
}

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

const diagnostics = {
  indexUrl,
  console: [],
  pageErrors: [],
  requestFailures: [],
  badResponses: [],
  timings: {
    directMs: null,
    iframeMs: null,
  },
  direct: null,
  iframe: null,
};

let hostServer = null;

try {
  // Stage 1: prove the published Godot page itself gets past Engine.startGame().
  const directStartedAt = Date.now();
  const direct = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  attachDiagnostics(direct, 'direct', diagnostics);
  await installMessageProbe(direct);
  await direct.goto(indexUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });

  let engineStarted = true;
  try {
    await direct.waitForFunction(() => !document.getElementById('status'), null, { timeout: 30_000 });
  } catch {
    engineStarted = false;
  }
  let directReady = false;
  if (engineStarted) {
    try {
      await direct.waitForFunction(
        () => Array.isArray(window.__pawnSlugGodotMessages)
          && window.__pawnSlugGodotMessages.some(
            (message) => message?.data?.source === 'pawn-slug-godot' && message?.data?.type === 'ready',
          ),
        null,
        { timeout: READY_BRIDGE_TIMEOUT_MS },
      );
      directReady = true;
    } catch {
      directReady = false;
    }
  }

  diagnostics.direct = await snapshotFrame(direct.mainFrame());
  diagnostics.direct.engineStarted = engineStarted;
  diagnostics.direct.readyMessage = directReady;
  diagnostics.timings.directMs = Date.now() - directStartedAt;

  if (!engineStarted) fail('direct-engine-start', diagnostics);
  if (!directReady) fail('direct-gdscript-bridge', diagnostics);

  // F5/reload contract: a fresh Godot lifecycle must boot and publish ready again
  // without depending on state left by the previous engine instance.
  await direct.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
  let directReloadReady = true;
  try {
    await direct.waitForFunction(() => !document.getElementById('status'), null, { timeout: 30_000 });
    await direct.waitForFunction(
      () => Array.isArray(window.__pawnSlugGodotMessages)
        && window.__pawnSlugGodotMessages.some(
          (message) => message?.data?.source === 'pawn-slug-godot' && message?.data?.type === 'ready',
        ),
      null,
      { timeout: READY_BRIDGE_TIMEOUT_MS },
    );
  } catch {
    directReloadReady = false;
  }
  diagnostics.direct.reloadReady = directReloadReady;
  diagnostics.direct.afterReload = await snapshotFrame(direct.mainFrame());
  if (!directReloadReady) fail('direct-reload-ready', diagnostics);
  await direct.close();

  // Stage 2: serve a loopback parent. Browsers treat loopback as potentially trustworthy,
  // matching Chess Studio's secure HTTPS ancestor while keeping the R2 iframe cross-origin.
  const hostHtml = `<!doctype html>
    <meta charset="utf-8">
    <style>html,body,iframe{margin:0;width:100%;height:100%;border:0;background:#07090b}</style>
    <iframe id="godot" title="Pawn Slug Godot live smoke" allow="autoplay; fullscreen; gamepad"></iframe>
    <script>
      const frame = document.getElementById('godot');
      window.__pawnSlugGodotMessages = [];
      window.__pawnSlugGodotEventCounts = {};
      window.addEventListener('message', (event) => {
        const message = event.data;
        window.__pawnSlugGodotMessages.push({
          origin: event.origin,
          sourceMatches: event.source === frame.contentWindow,
          data: message,
        });
        if (window.__pawnSlugGodotMessages.length > 40) window.__pawnSlugGodotMessages.shift();
        if (event.source !== frame.contentWindow) return;
        if (!message || message.source !== 'pawn-slug-godot') return;
        if (message.type) {
          window.__pawnSlugGodotEventCounts[message.type] =
            Number(window.__pawnSlugGodotEventCounts[message.type] || 0) + 1;
        }
        if (message.type === 'ready') document.body.dataset.godotReady = '1';
      });
      frame.src = ${JSON.stringify(indexUrl)};
    </script>`;

  hostServer = createServer((_request, response) => {
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    response.end(hostHtml);
  });
  await listen(hostServer);
  const address = hostServer.address();
  if (!address || typeof address === 'string') fail('iframe-host-listen', diagnostics);
  const parentUrl = `http://127.0.0.1:${address.port}/`;

  const iframeStartedAt = Date.now();
  const parent = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  attachDiagnostics(parent, 'iframe', diagnostics);
  await parent.goto(parentUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  const parentSecureContext = await parent.evaluate(() => window.isSecureContext);
  if (!parentSecureContext) {
    diagnostics.iframe = { parentUrl, parentSecureContext, frameUrls: parent.frames().map((frame) => frame.url()) };
    fail('iframe-parent-secure-context', diagnostics);
  }

  let iframeReady = true;
  try {
    await parent.waitForFunction(() => document.body.dataset.godotReady === '1', null, { timeout: 30_000 });
  } catch {
    iframeReady = false;
  }
  diagnostics.timings.iframeMs = Date.now() - iframeStartedAt;

  const child = parent.frames().find((candidate) => candidate !== parent.mainFrame() && candidate.url().startsWith(parsedIndex.origin));
  const parentMessages = await parent.evaluate(() => window.__pawnSlugGodotMessages || []);
  diagnostics.iframe = {
    parentUrl,
    parentSecureContext,
    readyMessage: iframeReady,
    parentMessages,
    child: child ? await snapshotFrame(child) : null,
    frameUrls: parent.frames().map((frame) => frame.url()),
  };

  if (!iframeReady) fail('iframe-bridge', diagnostics);
  if (!child) fail('iframe-navigation', diagnostics);

  const canvas = child.locator('canvas');
  await canvas.waitFor({ state: 'visible', timeout: 5_000 });
  const box = await canvas.boundingBox();
  diagnostics.iframe.canvasBox = box;
  if (!box || box.width < 320 || box.height < 180) fail('iframe-canvas-bounds', diagnostics);

  // Regression contract: ESC is pause/resume now, never an implicit exit.
  // The first focused gesture may enter browser fullscreen; two ESC presses
  // therefore cover both the browser-fullscreen path and the plain canvas path.
  await canvas.click({ position: { x: Math.max(20, box.width / 2), y: Math.max(20, box.height / 2) } });
  await parent.keyboard.press('Escape');
  await parent.waitForTimeout(100);
  await parent.keyboard.press('Escape');
  await parent.waitForTimeout(100);

  const escapeExitMessages = await parent.evaluate(() => (
    (window.__pawnSlugGodotMessages || []).filter(
      (message) => message?.sourceMatches
        && message?.data?.source === 'pawn-slug-godot'
        && message?.data?.type === 'exit',
    )
  ));
  diagnostics.iframe.escapeExitMessages = escapeExitMessages;
  diagnostics.iframe.canvasAfterEscape = await canvas.boundingBox();
  if (escapeExitMessages.length > 0) fail('iframe-escape-must-pause-not-exit', diagnostics);
  if (!diagnostics.iframe.canvasAfterEscape) fail('iframe-escape-keeps-runtime-alive', diagnostics);

  // Exit/re-enter lifecycle contract: tear down the iframe runtime and mount the
  // same published release again. The new instance must become ready with one
  // live child frame/canvas and without an implicit exit message.
  await parent.evaluate(() => {
    document.body.dataset.godotReady = '';
    const frame = document.getElementById('godot');
    frame.src = 'about:blank';
  });
  await parent.waitForTimeout(120);
  await parent.evaluate((url) => {
    const frame = document.getElementById('godot');
    frame.src = url;
  }, indexUrl);

  let remountReady = true;
  try {
    await parent.waitForFunction(() => document.body.dataset.godotReady === '1', null, { timeout: 30_000 });
  } catch {
    remountReady = false;
  }
  const remountedChildren = parent.frames().filter(
    (candidate) => candidate !== parent.mainFrame() && candidate.url().startsWith(parsedIndex.origin),
  );
  diagnostics.iframe.remountReady = remountReady;
  diagnostics.iframe.remountedFrameCount = remountedChildren.length;
  diagnostics.iframe.remountedChild = remountedChildren[0] ? await snapshotFrame(remountedChildren[0]) : null;
  if (!remountReady) fail('iframe-remount-ready', diagnostics);
  if (remountedChildren.length !== 1) fail('iframe-remount-single-runtime', diagnostics);
  const remountedCanvas = remountedChildren[0].locator('canvas');
  await remountedCanvas.waitFor({ state: 'visible', timeout: 5_000 });
  if (!(await remountedCanvas.boundingBox())) fail('iframe-remount-canvas', diagnostics);

  // Stage 3: drive the published build through real gameplay using only public
  // keyboard input + the existing iframe bridge.
  await gameplayAutopilot(parent, remountedCanvas, diagnostics);

  if (diagnostics.pageErrors.length || diagnostics.requestFailures.length || diagnostics.badResponses.length) {
    fail('browser-errors', diagnostics);
  }

  console.log(
    `pawn-slug-godot browser smoke OK · engine + ready + secure cross-origin iframe + visible canvas + ESC pause + reload/remount lifecycle + gameplay autopilot · direct=${diagnostics.timings.directMs}ms iframe=${diagnostics.timings.iframeMs}ms · ${indexUrl}`,
  );
} finally {
  await closeServer(hostServer);
  await browser.close();
}
