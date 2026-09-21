import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const requireFromE2e = createRequire(new URL('../e2e/package.json', import.meta.url));
const { chromium } = requireFromE2e('playwright');

const indexUrl = String(
  process.env.PAWN_SLUG_GODOT_INDEX_URL ||
  'http://127.0.0.1:4179/index.html?stage=industrial_front_v1'
).trim();
const outputDir = String(process.env.PAWN_SLUG_CAPTURE_DIR || '/tmp/pawn-slug-visual').trim();
const stageIds = String(
  process.env.PAWN_SLUG_CAPTURE_STAGES ||
  'industrial_front_v1,harbor_raid_v1,alpine_fortress_v1,jungle_relay_v1'
)
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

if (stageIds.length === 0) {
  throw new Error('Pawn Slug visual capture needs at least one stage id');
}

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

function urlForStage(stageId, visualProbeX = null) {
  const url = new URL(indexUrl);
  url.searchParams.set('stage', stageId);
  if (Number.isFinite(visualProbeX)) {
    url.searchParams.set('visual_probe_x', String(visualProbeX));
  } else {
    url.searchParams.delete('visual_probe_x');
  }
  return url.toString();
}

async function loadStage(stageId, visualProbeX = null) {
  const url = urlForStage(stageId, visualProbeX);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForSelector('canvas', { state: 'visible', timeout: 45_000 });
  await page.waitForFunction(() => window.__pawnSlugCaptureReady === true, null, { timeout: 45_000 });
  await page.waitForTimeout(1600);

  const canvasLocator = page.locator('canvas');
  const canvas = await canvasLocator.boundingBox();
  if (!canvas || canvas.width < 640 || canvas.height < 360) {
    throw new Error(`Pawn Slug canvas is unexpectedly small for ${stageId}: ${JSON.stringify(canvas)}`);
  }
  return { stageId, url, canvas, canvasLocator };
}

const stageOverviews = [];
const traversalProbes = [];
const captures = [];
async function capture(label) {
  const path = `${outputDir}/${label}.png`;
  await page.screenshot({ path, fullPage: false });
  captures.push({ label, path });
}

const detailedStage = stageIds[0];
const detailed = await loadStage(detailedStage);
const overviewPath = `${outputDir}/stage-${detailedStage}.png`;
await page.screenshot({ path: overviewPath, fullPage: false });
stageOverviews.push({ stageId: detailedStage, url: detailed.url, canvas: detailed.canvas, path: overviewPath });

// Keep the historical filename for consumers that only need one proof image.
const legacyOutputPath = `${outputDir}/pawn-slug-industrial-runtime.png`;
await page.screenshot({ path: legacyOutputPath, fullPage: false });
await capture('00-idle');

// Exercise the actual Godot runtime, not only the packed sheet. The short burst
// samples almost every 16 fps run frame and makes blank/sunk/jumping frames or
// silhouette flicker obvious in the uploaded PR artifact.
await detailed.canvasLocator.click({ position: { x: detailed.canvas.width / 2, y: detailed.canvas.height / 2 } });
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

// Every shipped stage gets a first-screen visual proof. This keeps scenery,
// parallax and map-authored props reviewable without multiplying the expensive
// movement-frame sequence four times.
for (const stageId of stageIds.slice(1)) {
  const stage = await loadStage(stageId);
  const path = `${outputDir}/stage-${stageId}.png`;
  await page.screenshot({ path, fullPage: false });
  stageOverviews.push({ stageId, url: stage.url, canvas: stage.canvas, path });
}

// Traversal changes can live well beyond the opening viewport. A localhost-only
// Godot visual probe positions Matthias/camera at the authored pit so PR review
// sees the actual runtime geometry without walking through combat for 10+ seconds.
const traversalProbeX = {
  industrial_front_v1: 1460,
  harbor_raid_v1: 480,
  alpine_fortress_v1: 3340,
  jungle_relay_v1: 480,
};
for (const stageId of stageIds) {
  const probeX = traversalProbeX[stageId];
  if (!Number.isFinite(probeX)) continue;
  const stage = await loadStage(stageId, probeX);
  const path = `${outputDir}/traversal-${stageId}.png`;
  await page.screenshot({ path, fullPage: false });
  traversalProbes.push({ stageId, probeX, url: stage.url, canvas: stage.canvas, path });
}

await writeFile(
  `${outputDir}/runtime-visual-health.json`,
  `${JSON.stringify({
    schema: 4,
    detailedStage,
    stageOverviews,
    traversalProbes,
    captures,
  }, null, 2)}\n`,
  'utf8',
);

console.log(JSON.stringify({
  detailedStage,
  stageOverviews: stageOverviews.length,
  traversalProbes: traversalProbes.length,
  captures: captures.length,
  legacyOutputPath,
}));
await browser.close();
