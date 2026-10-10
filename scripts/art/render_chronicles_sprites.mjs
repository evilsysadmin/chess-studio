#!/usr/bin/env node
// Renders the hand-authored Chronicles 2.5D billboard sprites (vector source
// in scripts/art/chronicles_sprites/) into packed WebP sheets for runtime.
//
//   node scripts/art/render_chronicles_sprites.mjs [--out frontend/src/assets/chronicles/sprites]
//
// One row, one 256×256 cell per frame, rendered at FRAME_PX for crispness.
// Deterministic: same source → same pixels (Chromium rasterizer).
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BONE_HOUND_FRAMES, boneHoundFrame } from './chronicles_sprites/bone_hound.mjs';
import { EDDA_FRAMES, eddaFrame } from './chronicles_sprites/edda.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const require = createRequire(path.join(repo, 'e2e', 'package.json'));
const { chromium } = require('@playwright/test');

const FRAME_PX = 384;
const SHEETS = [
  { id: 'bone-hound', frames: BONE_HOUND_FRAMES, draw: boneHoundFrame },
  { id: 'rookwood-mourner', frames: EDDA_FRAMES, draw: eddaFrame },
];

// MM3-style palette banding (0 = smooth gradients). Each cell gets its own
// id namespace so filters/gradients never leak between frames.
const BANDS = Number(process.env.SPRITE_BANDS || 0);

function scopeIds(svg, prefix) {
  return svg
    .replace(/id="([^"]+)"/g, `id="${prefix}-$1"`)
    .replace(/url\(#([^)]+)\)/g, `url(#${prefix}-$1)`);
}

function sheetSvg({ id, frames, draw }) {
  const cells = frames.map((frame, index) => `
    <svg x="${index * FRAME_PX}" y="0" width="${FRAME_PX}" height="${FRAME_PX}" viewBox="0 0 256 256">
      ${scopeIds(draw(frame, { bands: BANDS }), `${id}-${index}`)}
    </svg>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${frames.length * FRAME_PX}" height="${FRAME_PX}">${cells}</svg>`;
}

const outArg = process.argv.indexOf('--out');
const outDir = path.resolve(repo, outArg > 0 ? process.argv[outArg + 1] : 'frontend/src/assets/chronicles/sprites');
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
const manifest = {};
for (const sheet of SHEETS) {
  const svg = sheetSvg(sheet);
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  const png = await page.locator('svg').first().screenshot({ omitBackground: true });
  const webp = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext('2d').drawImage(image, 0, 0);
    return canvas.toDataURL('image/webp', 0.84).split(',')[1];
  }, png.toString('base64'));
  const file = path.join(outDir, `${sheet.id}.webp`);
  await writeFile(file, Buffer.from(webp, 'base64'));
  manifest[sheet.id] = { frames: sheet.frames.map((frame) => frame.id), framePx: FRAME_PX };
  console.log(`wrote ${path.relative(repo, file)} (${sheet.frames.length} frames)`);
}
await browser.close();
await writeFile(path.join(outDir, 'sprites.json'), `${JSON.stringify(manifest, null, 2)}\n`);
