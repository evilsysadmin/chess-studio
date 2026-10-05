#!/usr/bin/env node
// Gate: the Así juegas still shown on software WebGL must be a render of the
// current room. render_insights_training_room_still.mjs records the sha256 of
// the scene sources next to the image; changing the room without re-rendering
// fails here.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assetDir = resolve(root, 'frontend/src/assets/insights');
const fail = (message) => {
  console.error(`training-room-still: ${message}`);
  process.exit(1);
};

const EXPECTED_SOURCES = [
  'frontend/src/components/InsightsTrainingRoomShell.js',
  'frontend/src/components/InsightsTrainingRoomStage.js',
];
const manifest = JSON.parse(readFileSync(resolve(assetDir, 'training-room-still.json'), 'utf8'));
if (JSON.stringify(manifest.sources) !== JSON.stringify(EXPECTED_SOURCES)) {
  fail(`sources ${JSON.stringify(manifest.sources)} != ${JSON.stringify(EXPECTED_SOURCES)}`);
}
const hash = createHash('sha256');
for (const source of manifest.sources) hash.update(readFileSync(resolve(root, source)));
const digest = hash.digest('hex');
if (digest !== manifest.sourceSha256) {
  fail(`the room changed (${digest.slice(0, 12)} != ${String(manifest.sourceSha256).slice(0, 12)}); re-render with node scripts/render_insights_training_room_still.mjs and review it`);
}

const stage = readFileSync(resolve(root, 'frontend/src/components/InsightsTrainingRoomStage.js'), 'utf8');
const size = stage.match(/INSIGHTS_TRAINING_ROOM_STILL_SIZE = Object\.freeze\(\{ width: (\d+), height: (\d+) \}\)/);
if (!size) fail('INSIGHTS_TRAINING_ROOM_STILL_SIZE not found');
const [width, height] = [Number(size[1]), Number(size[2])];
if (manifest.width !== width || manifest.height !== height) fail(`still is ${manifest.width}x${manifest.height}, stage expects ${width}x${height}`);
// The stage caps at 1658×788: the still keeps that widest aspect so cover
// cropping reproduces the fixed-vertical-FOV camera.
if (Math.abs(width / height - 1658 / 788) > 0.005) fail(`aspect ${(width / height).toFixed(3)} is not the widest stage aspect`);

const webp = readFileSync(resolve(assetDir, 'training-room-still.webp'));
if (webp.subarray(0, 4).toString('latin1') !== 'RIFF' || webp.subarray(8, 12).toString('latin1') !== 'WEBP') fail('not a WebP');
if (webp.length > 200 * 1024) fail(`${Math.round(webp.length / 1024)} KiB exceeds the 200 KiB budget`);

console.log(`training-room-still OK · ${width}x${height} · ${Math.round(webp.length / 1024)} KiB · sources ${digest.slice(0, 12)}`);
