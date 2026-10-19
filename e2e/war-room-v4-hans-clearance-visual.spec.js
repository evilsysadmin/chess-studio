import { chromium, expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { buttonWithVisibleText, login, mockApi } from './helpers.js';
import { warRoomHansEventForGame } from '../frontend/src/components/WarRoomHansEventContract.js';
import { installManifestPinnedV4Model } from './v4-immutable-model.js';

const DIR = '../.artifacts/app-visual';
const REVISION = String(process.env.APP_VISUAL_EXPECTED_WAR_ROOM_V4_REVISION || '').trim();

function firstFireGameIndex() {
  for (let index = 1; index <= 96; index += 1) {
    if (warRoomHansEventForGame(`e2e-game-${index}`) === 'fire') return index;
  }
  throw new Error('No deterministic Hans fire-game fixture');
}

test('War Room V4 · Hans realmente atraviesa su nuevo pasillo en WebGL', async () => {
  test.setTimeout(300_000);
  if (!REVISION) throw new Error('An exact V4 authored model revision is required');
  await mkdir(DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, hasTouch: false });
  const page = await context.newPage();
  try {
    const pinned = await installManifestPinnedV4Model(page);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await mockApi(page, {
      profileSeed: { 'matthias.onboarded': '2', 'chess-study-home-guide-dismissed-v1': '1' },
    });
    await login(page);
    await page.evaluate(() => localStorage.setItem('chess-study-war-room-variant-v1', 'v4'));
    const gameIndex = firstFireGameIndex();
    if (gameIndex > 1) {
      await page.evaluate(async (count) => {
        for (let index = 1; index < count; index += 1) {
          await fetch('http://localhost:4000/api/games', {
            method: 'POST', mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain' }, body: '{}',
          });
        }
      }, gameIndex);
    }
    await buttonWithVisibleText(page, 'Partida rápida').press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Configurar partida rápida' });
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await dialog.getByRole('button', { name: 'Empezar partida', exact: true }).press('Enter');

    const canvas = page.locator('canvas.board3d-main-canvas');
    await expect(canvas).toBeVisible({ timeout: 90_000 });
    await expect(canvas).toHaveAttribute('data-war-room-variant', 'v4', { timeout: 90_000 });
    await expect(canvas).toHaveAttribute('data-war-room-variant-status', 'ready', { timeout: 90_000 });
    await expect(canvas).toHaveAttribute('data-war-room-hans-stage', /^v4-tower-study:quick$/, { timeout: 90_000 });
    await expect(canvas).toHaveAttribute('data-war-room-hans-scene-ready', 'true', { timeout: 90_000 });
    await expect(canvas).toHaveAttribute('data-war-room-hans-call-released', 'true', { timeout: 90_000 });
    await expect(canvas).toHaveAttribute('data-war-room-hans-reply-seen', 'true', { timeout: 90_000 });
    await expect(canvas).toHaveAttribute('data-war-room-hans-screen', /^(onscreen|edge)$/, { timeout: 25_000 });
    await expect(canvas).toHaveAttribute('data-war-room-hans-ground-gap', /^[0-9]/, { timeout: 25_000 });

    // Snapshot while an actual moving actor is onscreen: the normal V4 scene
    // screenshots only show an empty service aisle and a Matthias dialogue card.
    const captures = [];
    const start = Date.now();
    while (Date.now() - start < 6_000) {
      captures.push(await canvas.evaluate((node) => ({
        screen: node.dataset.warRoomHansScreen || '',
        route: node.dataset.warRoomHansRoute || '',
        phase: node.dataset.warRoomHansChoreographyPhase || '',
        ndcX: Number(node.dataset.warRoomHansNdcX),
        ndcY: Number(node.dataset.warRoomHansNdcY),
        groundGap: Number(node.dataset.warRoomHansGroundGap),
      })));
      await page.waitForTimeout(350);
    }
    expect(captures.filter((sample) => /^(onscreen|edge)$/.test(sample.screen)).length)
      .toBeGreaterThan(2);
    expect(captures.some((sample) => sample.route === 'stage-entry' || sample.route === 'stage-leave'))
      .toBe(true);
    for (const sample of captures.filter((sample) => /^(onscreen|edge)$/.test(sample.screen))) {
      expect(Number.isFinite(sample.ndcX) && Number.isFinite(sample.ndcY)).toBe(true);
      expect(Math.abs(sample.groundGap)).toBeLessThanOrEqual(0.02);
    }
    // SwiftShader's browser compositor can stall for >30 seconds on a full
    // viewport screenshot while Hans is animating. Read the actual 3D canvas
    // instead; visual builds preserveDrawingBuffer and this image proves the
    // character is rendered in the room, without HUD/screenshot-compositor lag.
    const rendered = await canvas.evaluate(async (node) => {
      const url = node.toDataURL('image/png');
      const image = new Image();
      image.src = url;
      await image.decode();
      const sample = document.createElement('canvas');
      sample.width = 32;
      sample.height = 24;
      const ctx = sample.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(image, 0, 0, 32, 24);
      const rgba = ctx.getImageData(0, 0, 32, 24).data;
      let lit = 0;
      for (let i = 0; i < rgba.length; i += 4) {
        if (rgba[i] + rgba[i + 1] + rgba[i + 2] > 120) lit += 1;
      }
      return { base64: url.split(',')[1], litShare: lit / (32 * 24) };
    });
    expect(rendered.litShare, 'Hans screenshot cannot be an empty WebGL frame').toBeGreaterThan(0.12);
    await writeFile(DIR + '/war-room-v4-hans-walking-1280x720.png', Buffer.from(rendered.base64, 'base64'));
    await writeFile(DIR + '/war-room-v4-hans-walking-1280x720.json', JSON.stringify({
      revision: REVISION, pinnedSha256: pinned.sha256,
      viewport: { width: 1280, height: 720 }, samples: captures,
    }, null, 2));
    console.log('V4_HANS_MOVING ' + JSON.stringify({
      revision: REVISION, pinnedSha256: pinned.sha256,
      samples: captures.length, visible: captures.filter((x) => x.screen === 'onscreen').length,
    }));
  } finally {
    await context.close();
    await browser.close();
  }
});
