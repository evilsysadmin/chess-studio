import { createRequire } from 'node:module';

const requireFromE2e = createRequire(new URL('../e2e/package.json', import.meta.url));
const { chromium } = requireFromE2e('playwright');

const indexUrl = String(process.env.PAWN_SLUG_GODOT_INDEX_URL || '').trim();
if (!indexUrl) throw new Error('PAWN_SLUG_GODOT_INDEX_URL is required');

const parsedIndex = new URL(indexUrl);
if (parsedIndex.protocol !== 'https:') throw new Error(`Godot smoke requires HTTPS: ${indexUrl}`);

const LIMIT = 40;
const clip = (value, max = 500) => String(value ?? '').slice(0, max);
const pushBounded = (list, value) => {
  list.push(value);
  if (list.length > LIMIT) list.shift();
};

function attachDiagnostics(page, label, diagnostics) {
  page.on('console', (message) => {
    pushBounded(diagnostics.console, { label, type: message.type(), text: clip(message.text()) });
  });
  page.on('pageerror', (error) => {
    pushBounded(diagnostics.pageErrors, { label, message: clip(error?.message || error) });
  });
  page.on('requestfailed', (request) => {
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
  direct: null,
  iframe: null,
};

try {
  // Stage 1: prove the published Godot page itself gets past Engine.startGame().
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
  diagnostics.direct = await snapshotFrame(direct.mainFrame());
  diagnostics.direct.engineStarted = engineStarted;

  const directReady = diagnostics.direct.messages?.some(
    (message) => message?.data?.source === 'pawn-slug-godot' && message?.data?.type === 'ready',
  );
  diagnostics.direct.readyMessage = Boolean(directReady);

  if (!engineStarted) fail('direct-engine-start', diagnostics);
  if (!directReady) fail('direct-gdscript-bridge', diagnostics);
  await direct.close();

  // Stage 2: mirror the product host: source check + payload check, no stricter origin policy.
  const parent = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  attachDiagnostics(parent, 'iframe', diagnostics);
  await parent.setContent(`<!doctype html>
    <meta charset="utf-8">
    <style>html,body,iframe{margin:0;width:100%;height:100%;border:0;background:#07090b}</style>
    <iframe id="godot" title="Pawn Slug Godot live smoke"></iframe>
    <script>
      const frame = document.getElementById('godot');
      window.__pawnSlugGodotMessages = [];
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
        if (message.type === 'ready') document.body.dataset.godotReady = '1';
      });
      frame.src = ${JSON.stringify(indexUrl)};
    </script>`);

  let iframeReady = true;
  try {
    await parent.waitForFunction(() => document.body.dataset.godotReady === '1', null, { timeout: 30_000 });
  } catch {
    iframeReady = false;
  }

  const child = parent.frames().find((candidate) => candidate !== parent.mainFrame() && candidate.url().startsWith(parsedIndex.origin));
  const parentMessages = await parent.evaluate(() => window.__pawnSlugGodotMessages || []);
  diagnostics.iframe = {
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

  if (diagnostics.pageErrors.length || diagnostics.requestFailures.length || diagnostics.badResponses.length) {
    fail('browser-errors', diagnostics);
  }

  console.log(`pawn-slug-godot browser smoke OK · engine + ready + iframe + visible canvas · ${indexUrl}`);
} finally {
  await browser.close();
}
