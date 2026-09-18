import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';

const requireFromE2e = createRequire(new URL('../e2e/package.json', import.meta.url));
const { chromium } = requireFromE2e('playwright');

const indexUrl = String(
  process.env.PAWN_SLUG_GODOT_INDEX_URL ||
  'http://127.0.0.1:4179/index.html?stage=industrial_front_v1'
).trim();
const outputDir = String(process.env.PAWN_SLUG_CAPTURE_DIR || '/tmp/pawn-slug-visual').trim();
const outputPath = `${outputDir}/pawn-slug-industrial-runtime.png`;

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

await page.addInitScript(() => {
  window.__pawnSlugCaptureReady = false;
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (data?.source === 'pawn-slug-godot' && data?.type === 'ready') {
      window.__pawnSlugCaptureReady = true;
    }
  });
});

await page.goto(indexUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
await page.waitForSelector('canvas', { state: 'visible', timeout: 45_000 });
await page.waitForFunction(() => window.__pawnSlugCaptureReady === true, null, { timeout: 45_000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: outputPath, fullPage: false });

const canvas = await page.locator('canvas').boundingBox();
if (!canvas || canvas.width < 640 || canvas.height < 360) {
  throw new Error(`Pawn Slug canvas is unexpectedly small: ${JSON.stringify(canvas)}`);
}

console.log(JSON.stringify({ indexUrl, outputPath, canvas }));
await browser.close();
