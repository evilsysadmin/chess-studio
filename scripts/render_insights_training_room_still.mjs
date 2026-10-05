#!/usr/bin/env node
// Renders the Así juegas training room (InsightsTrainingRoomStage.js, the very
// scene the live 3D view draws) to the WebP still that software-WebGL clients
// see instead of waiting ~10 s for the CPU to compile the first frame.
//
//   node scripts/render_insights_training_room_still.mjs [--url http://127.0.0.1:4173/chess-studio/] [--out path.webp]
//
// Without --url it starts the Vite dev server itself. Re-run it whenever the
// room (InsightsTrainingRoomShell.js / InsightsTrainingRoomStage.js) changes,
// then review the image against the live room before committing it.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(root, 'e2e/package.json'));
const { chromium } = require('@playwright/test');

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const out = resolve(root, arg('--out', 'frontend/src/assets/insights/training-room-still.webp'));
// The still is accredited against these sources (training-room-still.json);
// InsightsTrainingRoomStill.test.js fails when they change without a re-render.
const STILL_SOURCES = [
  'frontend/src/components/InsightsTrainingRoomShell.js',
  'frontend/src/components/InsightsTrainingRoomStage.js',
];
const quality = Number(arg('--quality', '0.84'));
let baseUrl = arg('--url', '');
let server;

async function waitFor(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`dev server did not answer at ${url}`);
}

try {
  if (!baseUrl) {
    baseUrl = 'http://127.0.0.1:4189/chess-studio/';
    server = spawn('npm', ['--prefix', resolve(root, 'frontend'), 'run', 'dev', '--', '--host', '127.0.0.1', '--port', '4189', '--strictPort', '--base', '/chess-studio/'], { stdio: 'ignore', detached: true });
    await waitFor(baseUrl, 60_000);
  }
  const base = new URL(baseUrl);
  const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  await page.goto(new URL('favicon.svg', base).href);
  const result = await page.evaluate(async ({ basePath, quality: q }) => {
    const { createThreeRenderer } = await import(`${basePath}src/threeRenderer.js`);
    const stageModule = await import(`${basePath}src/components/InsightsTrainingRoomStage.js`);
    const { width, height } = stageModule.INSIGHTS_TRAINING_ROOM_STILL_SIZE;
    const canvas = document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas');
    canvas.width = width;
    canvas.height = height;
    const renderer = createThreeRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    stageModule.configureInsightsTrainingRoomRenderer(renderer, { pixelRatio: 1 });
    const stage = stageModule.buildInsightsTrainingRoomStage(renderer);
    stage.render(width, height);
    const dataUrl = canvas.toDataURL('image/webp', q);
    const rendererName = stageModule.insightsTrainingRoomRendererName(renderer);
    stage.dispose();
    renderer.dispose();
    return { dataUrl, width, height, rendererName };
  }, { basePath: base.pathname, quality });
  await browser.close();
  if (!result.dataUrl.startsWith('data:image/webp;base64,')) throw new Error('browser did not encode WebP');
  const bytes = Buffer.from(result.dataUrl.split(',', 2)[1], 'base64');
  writeFileSync(out, bytes);
  const sourceHash = createHash('sha256');
  for (const source of STILL_SOURCES) sourceHash.update(readFileSync(resolve(root, source)));
  writeFileSync(out.replace(/\.webp$/, '.json'), `${JSON.stringify({
    sources: STILL_SOURCES,
    sourceSha256: sourceHash.digest('hex'),
    width: result.width,
    height: result.height,
    renderer: result.rendererName,
  }, null, 2)}\n`);
  console.log(`training-room still: ${out} ${result.width}x${result.height} ${Math.round(bytes.length / 1024)} KiB renderer=${result.rendererName}`);
} finally {
  if (server) {
    try { process.kill(-server.pid, 'SIGTERM'); } catch { /* already gone */ }
  }
}
