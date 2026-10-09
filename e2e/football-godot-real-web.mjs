#!/usr/bin/env node
// Exercise exported Godot WASM in Chromium, not a mocked iframe.
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(process.argv[2] || 'games/chess-football-godot/build/web');
const output = resolve('.artifacts/football-web');
mkdirSync(output, { recursive: true });
if (!existsSync(resolve(root, 'index.html'))) throw new Error('Missing exported Godot index.html');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.wasm': 'application/wasm', '.pck': 'application/octet-stream', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = createServer((req, res) => {
  try {
    let path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (path !== root && !path.startsWith(root + sep)) throw new Error('Bad path');
    if (path === root) path = resolve(root, 'index.html');
    if (!existsSync(path)) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    createReadStream(path).pipe(res);
  } catch (error) { res.writeHead(400); res.end(String(error)); }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const port = server.address().port;
const messages = [];
const failures = [];
let browser;
let page;
try {
  browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await page.addInitScript(() => {
    window.__chessFootballWebReady = false;
    window.addEventListener('message', (event) => {
      if (event.data?.source === 'chess-football-godot' && event.data.type === 'ready') window.__chessFootballWebReady = true;
    });
  });
  page.on('console', (line) => {
    const msg = line.type() + ': ' + line.text();
    messages.push(msg);
    if (line.type() === 'error' && /null function|RuntimeError|abort\(/i.test(msg)) failures.push(msg);
  });
  page.on('pageerror', (error) => failures.push('PAGE ERROR: ' + (error.stack || error.message)));
  page.on('requestfailed', (request) => {
    const reason = request.failure()?.errorText || '';
    // Chromium may cancel the redundant streaming fetch when Godot has already
    // consumed the PCK. Only genuine transport failures are fatal here; no
    // successful scene bootstrap will occur if the PCK was actually missing.
    if (reason === 'net::ERR_ABORTED') return;
    failures.push('REQUEST FAILED: ' + request.url() + ' ' + reason);
  });
  const url = 'http://127.0.0.1:' + port + '/index.html';
  console.log('Launching actual Godot Web release:', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => window.__chessFootballWebReady === true, null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  if (failures.length) throw new Error('Web runtime errors: ' + failures.slice(0, 8).join('\n'));
  if (await page.locator('canvas').count() === 0) throw new Error('Godot reported ready without canvas');
  // Software WebGL in hosted Chromium can stall indefinitely on readPixels.
  // A successful scene handshake and clean browser error log are the hard gate;
  // visual PNG evidence is already produced separately by Godot's capture job.
  await page.screenshot({ path: resolve(output, 'real-web-kickoff.png'), timeout: 4000 })
    .catch((error) => console.warn('Optional software-WebGL screenshot unavailable: ' + error.message));
  console.log('CHESS_FOOTBALL_REAL_WEB_READY OK');
} catch (error) {
  if (page) await page.screenshot({ path: resolve(output, 'real-web-failure.png'), timeout: 10000 }).catch(() => {});
  console.error('REAL GODOT WEB BOOT FAILURE:', String(error));
  console.error('Runtime errors:\n' + failures.slice(-25).join('\n'));
  console.error('Browser console:\n' + messages.slice(-60).join('\n'));
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  await new Promise((ok) => server.close(ok));
}
