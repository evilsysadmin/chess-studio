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
  window.__pawnSlugCaptureEvents = [];
  const params = new URLSearchParams(window.location.search);
  const stage = params.get('stage') || '';
  const traversalProbes = {
    industrial_front_v1: 1900,
    harbor_raid_v1: 3860,
    alpine_fortress_v1: 4200,
    jungle_relay_v1: 3820,
  };
  window.__pawnSlugVisualProbeX =
    params.get('visualProbe') === '1' ? traversalProbes[stage] ?? null : null;
  window.__pawnSlugVisualProbeWeapon = params.get('weaponProbe') || '';
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (data?.source !== 'pawn-slug-godot') return;
    window.__pawnSlugCaptureEvents.push(String(data?.type || ''));
    if (data?.type === 'ready') {
      window.__pawnSlugCaptureReady = true;
    }
  });
});

function urlForStage(stageId, { visualProbe = false, weaponProbe = '' } = {}) {
  const url = new URL(indexUrl);
  url.searchParams.set('stage', stageId);
  if (visualProbe) url.searchParams.set('visualProbe', '1');
  else url.searchParams.delete('visualProbe');
  if (weaponProbe) url.searchParams.set('weaponProbe', weaponProbe);
  else url.searchParams.delete('weaponProbe');
  return url.toString();
}

async function loadStage(stageId, options = {}) {
  const url = urlForStage(stageId, options);
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
const captures = [];
async function capture(label) {
  const path = `${outputDir}/${label}.png`;
  await page.screenshot({ path, fullPage: false });
  captures.push({ label, path, kind: 'overview' });
}

async function captureDetailedCloseup(label, canvas) {
  const path = `${outputDir}/${label}-closeup.png`;
  const clip = {
    x: Math.max(0, canvas.x),
    y: Math.max(0, canvas.y + canvas.height * 0.38),
    width: Math.min(canvas.width * 0.52, 560),
    height: Math.min(canvas.height * 0.58, 420),
  };
  await page.screenshot({ path, clip });
  captures.push({ label: `${label}-closeup`, path, kind: 'player-closeup' });
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
await captureDetailedCloseup('00-idle', detailed.canvas);

// Exercise the actual Godot runtime, not only the packed sheet. The short burst
// samples almost every 16 fps run frame and makes blank/sunk/jumping frames or
// silhouette flicker obvious in the uploaded PR artifact.
await detailed.canvasLocator.click({ position: { x: detailed.canvas.width / 2, y: detailed.canvas.height / 2 } });
await page.keyboard.down('ArrowRight');
await page.waitForTimeout(320);
for (let frame = 0; frame < 12; frame += 1) {
  const label = `10-run-${String(frame).padStart(2, '0')}`;
  await capture(label);
  if ([0, 3, 7, 11].includes(frame)) await captureDetailedCloseup(label, detailed.canvas);
  await page.waitForTimeout(50);
}

// Fire while still moving so pistol-vs-SMG silhouette mistakes, bad muzzle
// alignment, or one-shot animation pops are visible frame-by-frame.
await page.keyboard.down('z');
for (let frame = 0; frame < 12; frame += 1) {
  const label = `20-run-fire-${String(frame).padStart(2, '0')}`;
  await capture(label);
  if ([0, 3, 7, 11].includes(frame)) await captureDetailedCloseup(label, detailed.canvas);
  await page.waitForTimeout(55);
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
  const label = `40-crouch-${String(frame).padStart(2, '0')}`;
  await capture(label);
  if ([0, 2, 3].includes(frame)) await captureDetailedCloseup(label, detailed.canvas);
  await page.waitForTimeout(90);
}
await page.keyboard.up('ArrowDown');

// Dedicated SMG render/switch proof. The local PR capture uses a JS-only
// visual probe rather than depending on combat traversal. Staging E2E remains
// responsible for proving the real pickup path and weapon-pickup event.
const smgStage = await loadStage(detailedStage, { weaponProbe: 'machinegun' });
const smgProbeSelected = await page.evaluate(() => (
  Array.isArray(window.__pawnSlugCaptureEvents)
  && window.__pawnSlugCaptureEvents.includes('weapon-changed')
));
if (!smgProbeSelected) {
  throw new Error('Pawn Slug SMG visual probe did not emit weapon-changed');
}
await smgStage.canvasLocator.click({ position: { x: smgStage.canvas.width / 2, y: smgStage.canvas.height / 2 } });
await capture('50-smg-selected-immediate');
await captureDetailedCloseup('50-smg-selected-immediate', smgStage.canvas);
await page.waitForTimeout(100);
await capture('51-smg-selected-after-100ms');
await captureDetailedCloseup('51-smg-selected-after-100ms', smgStage.canvas);

await page.keyboard.down('ArrowRight');
for (let frame = 0; frame < 13; frame += 1) {
  const label = `52-smg-run-${String(frame).padStart(2, '0')}`;
  await capture(label);
  if ([0, 4, 8, 12].includes(frame)) await captureDetailedCloseup(label, smgStage.canvas);
  await page.waitForTimeout(48);
}

await page.keyboard.down('z');
for (let frame = 0; frame < 13; frame += 1) {
  const label = `53-smg-run-fire-${String(frame).padStart(2, '0')}`;
  await capture(label);
  if ([0, 4, 8, 12].includes(frame)) await captureDetailedCloseup(label, smgStage.canvas);
  await page.waitForTimeout(55);
}
await page.keyboard.up('z');
await page.keyboard.up('ArrowRight');
await page.waitForTimeout(120);
await capture('54-smg-idle');
await captureDetailedCloseup('54-smg-idle', smgStage.canvas);

// Capture one representative traversal sector where the new industrial
// ladder, pit mouth and stepping-route platforms share the same viewport.
// This is a real Godot runtime frame; the probe only chooses the starting X.
const traversalProbe = await loadStage(detailedStage, { visualProbe: true });
const traversalProbePath = `${outputDir}/stage-${detailedStage}-traversal.png`;
await page.screenshot({ path: traversalProbePath, fullPage: false });
stageOverviews.push({
  stageId: detailedStage,
  variant: 'traversal',
  url: traversalProbe.url,
  canvas: traversalProbe.canvas,
  path: traversalProbePath,
});

// Every shipped stage gets a first-screen visual proof. This keeps scenery,
// parallax and map-authored props reviewable without multiplying the expensive
// movement-frame sequence four times.
for (const stageId of stageIds.slice(1)) {
  const stage = await loadStage(stageId);
  const path = `${outputDir}/stage-${stageId}.png`;
  await page.screenshot({ path, fullPage: false });
  stageOverviews.push({ stageId, variant: 'overview', url: stage.url, canvas: stage.canvas, path });

  const traversal = await loadStage(stageId, { visualProbe: true });
  const traversalPath = `${outputDir}/stage-${stageId}-traversal.png`;
  await page.screenshot({ path: traversalPath, fullPage: false });
  stageOverviews.push({
    stageId,
    variant: 'traversal',
    url: traversal.url,
    canvas: traversal.canvas,
    path: traversalPath,
  });
}

await writeFile(
  `${outputDir}/runtime-visual-health.json`,
  `${JSON.stringify({
    schema: 6,
    detailedStage,
    stageOverviews,
    captures,
  }, null, 2)}\n`,
  'utf8',
);

console.log(JSON.stringify({
  detailedStage,
  stageOverviews: stageOverviews.length,
  captures: captures.length,
  legacyOutputPath,
}));
await browser.close();
