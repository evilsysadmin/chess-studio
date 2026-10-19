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
  test.setTimeout(420_000);
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
    const snapshots = new Set();
    const requiredPhases = [
      'fire-dimming', 'take-log', 'carry-log', 'place-log',
      'take-poker', 'stoke-fire', 'return-poker', 'leave',
    ];
    const routeDisplacement = (samples) => {
      if (samples.length < 2) return 0;
      const first = samples[0];
      return Math.max(...samples.map((sample) =>
        Math.hypot(sample.logicalX - first.logicalX, sample.sceneZ - first.sceneZ)));
    };
    const saveFrame = async (name) => {
      const base64 = await canvas.evaluate((node) => node.toDataURL('image/png').split(',')[1]);
      await writeFile(DIR + '/war-room-v4-hans-' + name + '-1280x720.png', Buffer.from(base64, 'base64'));
      snapshots.add(name);
    };
    const start = Date.now();
    // The real performance runs at ~0.54x speed. The old 30cm criterion in
    // fire-dimming could pass without ever reaching or leaving the hearth.
    // Observe actual WebGL frames throughout both full corridor traversals.
    while (Date.now() - start < 120_000) {
      const sample = await canvas.evaluate((node) => ({
        screen: node.dataset.warRoomHansScreen || '',
        route: node.dataset.warRoomHansRoute || '',
        phase: node.dataset.warRoomHansChoreographyPhase || '',
        doorOpen: Number(node.dataset.warRoomHansDoorOpen),
        logicalX: Number(node.dataset.warRoomHansLogicalX),
        sceneZ: Number(node.dataset.warRoomHansSceneZ),
        ndcX: Number(node.dataset.warRoomHansNdcX),
        ndcY: Number(node.dataset.warRoomHansNdcY),
        groundGap: Number(node.dataset.warRoomHansGroundGap),
      }));
      captures.push(sample);
      const visible = captures.filter((item) => /^(onscreen|edge)$/.test(item.screen));
      const entering = visible.filter((item) => item.route === 'stage-entry');
      const leaving = visible.filter((item) => item.route === 'stage-leave');
      if (!snapshots.has('entering') && sample.screen === 'onscreen'
        && sample.route === 'stage-entry' && routeDisplacement(entering) >= 1.2) {
        await saveFrame('entering');
      }
      if (!snapshots.has('at-hearth') && sample.screen === 'onscreen'
        && sample.phase === 'stoke-fire') {
        await saveFrame('at-hearth');
      }
      if (!snapshots.has('leaving') && sample.screen === 'onscreen'
        && sample.route === 'stage-leave' && routeDisplacement(leaving) >= 1.2) {
        await saveFrame('leaving');
      }
      if (requiredPhases.every((phase) => captures.some((item) => item.phase === phase))
        && routeDisplacement(entering) >= 2.2
        && routeDisplacement(leaving) >= 2.2
        && leaving.length >= 8
        && snapshots.size === 3) break;
      await page.waitForTimeout(350);
    }
    const visible = captures.filter((item) => /^(onscreen|edge)$/.test(item.screen));
    const entering = visible.filter((item) => item.route === 'stage-entry');
    const leaving = visible.filter((item) => item.route === 'stage-leave');
    const phases = [...new Set(captures.map((item) => item.phase))];
    const entryTravel = routeDisplacement(entering);
    const exitTravel = routeDisplacement(leaving);
    const first = visible[0];
    const screenTravel = first ? Math.max(...visible.map((item) =>
      Math.hypot(item.ndcX - first.ndcX, item.ndcY - first.ndcY))) : 0;
    console.log('V4_HANS_FULL_ROUTE', JSON.stringify({
      entryTravel, exitTravel, screenTravel, phases,
      entrySamples: entering.length, exitSamples: leaving.length,
      snapshots: [...snapshots], totalSamples: captures.length,
    }));
    // Preserve the full trace even on assertion failures.
    await writeFile(DIR + '/war-room-v4-hans-full-route-1280x720.json', JSON.stringify({
      revision: REVISION, pinnedSha256: pinned.sha256,
      viewport: { width: 1280, height: 720 },
      entryTravel, exitTravel, phases, snapshots: [...snapshots], samples: captures,
    }, null, 2));
    expect(visible.length, 'Hans must be on screen throughout the routine').toBeGreaterThan(15);
    for (const phase of requiredPhases) {
      expect(phases, 'Missing real choreography phase: ' + phase).toContain(phase);
    }
    expect(entering.length, 'Must observe the actual door-to-hearth path').toBeGreaterThan(8);
    expect(leaving.length, 'Must observe the actual hearth-to-door path').toBeGreaterThanOrEqual(8);
    expect(entryTravel, 'Hans must walk at least 2.2m into the room').toBeGreaterThanOrEqual(2.2);
    expect(exitTravel, 'Hans must walk at least 2.2m back to the exit').toBeGreaterThanOrEqual(2.2);
    expect(screenTravel, 'Hans must visibly cross the rendered room').toBeGreaterThanOrEqual(0.015);
    expect([...snapshots].sort(), 'Entry, hearth and exit need actual WebGL PNG evidence')
      .toEqual(['at-hearth', 'entering', 'leaving']);
    for (const sample of visible) {
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
