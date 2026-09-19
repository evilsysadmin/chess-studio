import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

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
await page.waitForTimeout(1400);

const canvasLocator = page.locator('canvas');
const canvas = await canvasLocator.boundingBox();
if (!canvas || canvas.width < 640 || canvas.height < 360) {
  throw new Error(`Pawn Slug canvas is unexpectedly small: ${JSON.stringify(canvas)}`);
}

const captures = [];
async function capture(label) {
  const path = `${outputDir}/${label}.png`;
  await page.screenshot({ path, fullPage: false });
  captures.push({ label, path });
}

// Keep the historical filename for consumers that only need one proof image.
await page.screenshot({ path: outputPath, fullPage: false });
await capture('00-idle');

// Exercise the actual Godot runtime, not only the packed sheet. The short burst
// samples almost every 16 fps run frame and makes blank/sunk/jumping frames or
// silhouette flicker obvious in the uploaded PR artifact.
await canvasLocator.click({ position: { x: canvas.width / 2, y: canvas.height / 2 } });
await page.keyboard.down('ArrowRight');
await page.waitForTimeout(320);
for (let frame = 0; frame < 10; frame += 1) {
  await capture(`10-run-${String(frame).padStart(2, '0')}`);
  await page.waitForTimeout(70);
}

// Fire while still moving so pistol-vs-SMG silhouette mistakes, bad muzzle
// alignment, or one-shot animation pops are visible frame-by-frame.
await page.keyboard.down('z');
for (let frame = 0; frame < 8; frame += 1) {
  await capture(`20-run-fire-${String(frame).padStart(2, '0')}`);
  await page.waitForTimeout(80);
}
await page.keyboard.up('z');
await page.keyboard.up('ArrowRight');
await page.waitForTimeout(260);
await capture('30-idle-after-run-fire');

// Crouch is another high-risk body-anchor transition and costs almost nothing
// to sample while the runtime is already warm.
await page.keyboard.down('ArrowDown');
await page.waitForTimeout(160);
for (let frame = 0; frame < 4; frame += 1) {
  await capture(`40-crouch-${String(frame).padStart(2, '0')}`);
  await page.waitForTimeout(90);
}
await page.keyboard.up('ArrowDown');

await writeFile(
  `${outputDir}/runtime-visual-health.json`,
  `${JSON.stringify({ schema: 2, indexUrl, canvas, captures }, null, 2)}\n`,
  'utf8',
);

console.log(JSON.stringify({ indexUrl, outputPath, canvas, captures: captures.length }));
await browser.close();
