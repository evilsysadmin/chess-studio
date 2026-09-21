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
  window.__pawnSlugWeaponChangeCount = 0;
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
  window.__pawnSlugVisualProbeWeapon = params.get('visualWeapon') || '';
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (data?.source !== 'pawn-slug-godot') return;
    if (data?.type === 'ready') window.__pawnSlugCaptureReady = true;
    if (data?.type === 'weapon-changed') window.__pawnSlugWeaponChangeCount += 1;
  });
});

function urlForStage(stageId, { visualProbe = false, visualWeapon = '' } = {}) {
  const url = new URL(indexUrl);
  url.searchParams.set('stage', stageId);
  if (visualProbe) url.searchParams.set('visualProbe', '1');
  else url.searchParams.delete('visualProbe');
  if (visualWeapon) url.searchParams.set('visualWeapon', visualWeapon);
  else url.searchParams.delete('visualWeapon');
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

// Dedicated SMG proof: the CI-only probe unlocks machinegun but deliberately
// leaves pistol selected. Pressing the real slot key after ready exercises the
// same Player.select_weapon -> MatthiasArt.set_weapon path used by gameplay.
const smg = await loadStage(detailedStage, { visualWeapon: 'machinegun' });
await smg.canvasLocator.click({ position: { x: smg.canvas.width / 2, y: smg.canvas.height / 2 } });
const switchCount = await page.evaluate(() => window.__pawnSlugWeaponChangeCount || 0);
await page.keyboard.press('2');
await page.waitForFunction(
  (before) => (window.__pawnSlugWeaponChangeCount || 0) > before,
  switchCount,
  { timeout: 3_000 },
);
await page.waitForTimeout(16);
await capture('50-smg-switch-immediate');
await captureDetailedCloseup('50-smg-switch-immediate', smg.canvas);
await page.waitForTimeout(180);
await capture('51-smg-idle');
await captureDetailedCloseup('51-smg-idle', smg.canvas);

await page.keyboard.down('ArrowRight');
await page.waitForTimeout(240);
for (let frame = 0; frame < 13; frame += 1) {
  const label = `52-smg-run-${String(frame).padStart(2, '0')}`;
  await capture(label);
  if ([0, 4, 8, 12].includes(frame)) await captureDetailedCloseup(label, smg.canvas);
  await page.waitForTimeout(42);
}
await page.keyboard.down('z');
for (let frame = 0; frame < 13; frame += 1) {
  const label = `53-smg-run-fire-${String(frame).padStart(2, '0')}`;
  await capture(label);
  if ([0, 4, 8, 12].includes(frame)) await captureDetailedCloseup(label, smg.canvas);
  await page.waitForTimeout(48);
}
await page.keyboard.up('z');
await page.keyboard.up('ArrowRight');
await page.waitForTimeout(120);

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
