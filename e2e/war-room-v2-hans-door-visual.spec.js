import { chromium, expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { buttonWithVisibleText, login, mockApi } from './helpers.js';
import { warRoomHansEventForGame } from '../frontend/src/components/WarRoomHansEventContract.js';

const REVISION = String(process.env.APP_VISUAL_EXPECTED_WAR_ROOM_REVISION || '').trim();
const DIR = '../.artifacts/app-visual';
const STAGING = 'https://assets.chess-studio.shadowops.dpdns.org/war-room/v2/staging/revisions/';

// This proof is only registered in the V2 staging visual lane. Other E2E
// suites must not silently 'pass' a fake skipped door test.
if (REVISION) test('War Room V2 · Hans opens and closes the real service door', async () => {
  test.setTimeout(450_000);
  await mkdir(DIR, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }, hasTouch: false,
  });
  const page = await context.newPage();
  try {
    const response = await page.request.get(STAGING + encodeURIComponent(REVISION) + '.glb', {
      timeout: 20_000,
    });
    expect(response.ok(), 'Blender PR staging revision must exist').toBe(true);
    const glb = await response.body();
    expect(glb.byteLength).toBeGreaterThan(100_000);
    let served = 0;
    await page.route('**/war-room/v2/runtime/*.glb*', async (route) => {
      await route.fulfill({
        status: 200, contentType: 'model/gltf-binary',
        body: glb, headers: { 'cache-control': 'no-store' },
      });
      served += 1;
    });

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await mockApi(page, {
      profileSeed: {
        'matthias.onboarded': '2',
        'chess-study-home-guide-dismissed-v1': '1',
      },
    });
    await login(page);
    await page.evaluate(() => localStorage.setItem('chess-study-war-room-variant-v1', 'v2'));
    // Blender rooms offer only the fire routine. The fresh mock creates
    // e2e-game-1, so don't prime unrelated cross-origin game POST requests
    // merely to satisfy the classic room's 11-event selector.
    expect(warRoomHansEventForGame('e2e-game-1', { variant: 'v2' })).toBe('fire');
    await buttonWithVisibleText(page, 'Partida rápida').press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Configurar partida rápida' });
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await dialog.getByRole('button', { name: 'Empezar partida', exact: true }).press('Enter');

    const canvas = page.locator('canvas.board3d-main-canvas');
    await expect(canvas).toHaveAttribute('data-war-room-variant', 'v2', { timeout: 90_000 });
    await expect(canvas).toHaveAttribute('data-war-room-variant-status', 'ready', { timeout: 90_000 });
    expect(served, 'Runtime must fetch the PR staging V2 GLB').toBeGreaterThan(0);
    await expect(canvas).toHaveAttribute('data-war-room-hans-stage', /^v2-blender-hall:quick$/, {
      timeout: 90_000,
    });
    await expect(canvas).toHaveAttribute('data-war-room-hans-scene-ready', 'true', {
      timeout: 90_000,
    });

    const samples = [];
    const snapshots = new Set();
    const save = async (label) => {
      const base64 = await canvas.evaluate((node) => node.toDataURL('image/png').split(',')[1]);
      await writeFile(DIR + '/war-room-v2-hans-' + label + '-1280x720.png',
        Buffer.from(base64, 'base64'));
      snapshots.add(label);
    };
    const start = Date.now();
    while (Date.now() - start < 300_000) {
      const frame = await canvas.evaluate((node) => ({
        screen: node.dataset.warRoomHansScreen || '',
        route: node.dataset.warRoomHansRoute || '',
        phase: node.dataset.warRoomHansChoreographyPhase || '',
        doorOpen: Number(node.dataset.warRoomHansDoorOpen),
        actorVisible: node.dataset.warRoomHansActorVisible === 'true',
        completed: node.dataset.warRoomHansRoutineCompleted === 'true',
        x: Number(node.dataset.warRoomHansLogicalX),
        z: Number(node.dataset.warRoomHansSceneZ),
        groundGap: Number(node.dataset.warRoomHansGroundGap),
      }));
      samples.push(frame);
      if (!snapshots.has('entry') && frame.route === 'stage-entry'
        && frame.doorOpen >= 0.5 && /^(onscreen|edge)$/.test(frame.screen)) {
        await save('entry');
      }
      if (!snapshots.has('hearth') && frame.phase === 'stoke-fire'
        && frame.screen === 'onscreen') {
        await save('hearth');
      }
      if (!snapshots.has('exit') && frame.route === 'stage-leave'
        && frame.doorOpen >= 0.5 && /^(onscreen|edge)$/.test(frame.screen)) {
        await save('exit');
      }
      if (samples.some((v) => v.route === 'stage-leave' && v.doorOpen >= 0.5)
        && frame.completed && !frame.actorVisible && frame.doorOpen <= 0.02) {
        await save('closed');
        break;
      }
      await page.waitForTimeout(350);
    }
    const enters = samples.filter((v) => v.route === 'stage-entry' && v.actorVisible);
    const exits = samples.filter((v) => v.route === 'stage-leave' && v.actorVisible);
    const phases = [...new Set(samples.map((v) => v.phase))];
    const extent = (rows) => rows.length < 2 ? 0
      : Math.max(...rows.map((v) => Math.hypot(v.x - rows[0].x, v.z - rows[0].z)));
    const result = {
      revision: REVISION, served, phases,
      enteredMeters: extent(enters), exitedMeters: extent(exits),
      opened: samples.some((v) => v.doorOpen >= 0.5),
      final: samples.at(-1), snapshots: [...snapshots], samples,
    };
    await writeFile(DIR + '/war-room-v2-hans-route-1280x720.json',
      JSON.stringify(result, null, 2));
    console.log('V2_HANS_FULL_ROUTE', JSON.stringify({
      revision: REVISION, enters: enters.length, exits: exits.length,
      enteredMeters: result.enteredMeters, exitedMeters: result.exitedMeters,
      opened: result.opened, screenshots: [...snapshots],
    }));

    expect(enters.length).toBeGreaterThan(5);
    expect(exits.length).toBeGreaterThan(5);
    // The actual x=-8.68 wall is 4.13 m from the x=-4.55 hearth.
    // Require travel across the wall, not mere movement inside the room.
    const wallLocalX = 4.13;
    const entryThreshold = enters.filter((f) =>
      Number.isFinite(f.x) && Math.abs(f.x - wallLocalX) <= 0.56);
    const exitThreshold = exits.filter((f) =>
      Number.isFinite(f.x) && Math.abs(f.x - wallLocalX) <= 0.56);
    expect(entryThreshold.length, 'sample Hans crossing inward').toBeGreaterThan(0);
    expect(exitThreshold.length, 'sample Hans crossing outward').toBeGreaterThan(0);
    expect(entryThreshold.every((f) => f.doorOpen >= 0.9),
      'keep the oak leaf open while Hans enters').toBe(true);
    expect(exitThreshold.every((f) => f.doorOpen >= 0.9),
      'open the oak leaf before Hans leaves').toBe(true);
    expect(enters.some((f) => Number.isFinite(f.x) && f.x > wallLocalX + 0.56),
      'Hans must appear outside the structural wall in the alcove').toBe(true);
    expect(enters.some((f) => Number.isFinite(f.x) && f.x < wallLocalX - 0.56),
      'Hans must fully clear the threshold into the hall').toBe(true);
    expect(exits.some((f) => Number.isFinite(f.x) && f.x > wallLocalX + 0.56),
      'Hans must leave into the alcove through the real wall opening').toBe(true);
    expect(result.enteredMeters, 'Hans must traverse from door to hearth').toBeGreaterThan(1.5);
    expect(result.exitedMeters, 'Hans must return to the door').toBeGreaterThan(1.5);
    expect(result.opened, 'Door must actually swing').toBe(true);
    expect(result.final?.completed).toBe(true);
    expect(result.final?.actorVisible).toBe(false);
    expect(result.final?.doorOpen).toBeLessThanOrEqual(0.02);
    expect([...snapshots].sort()).toEqual(['closed', 'entry', 'exit', 'hearth']);
    for (const frame of samples.filter((v) => v.actorVisible && v.screen === 'onscreen')) {
      expect(Number.isFinite(frame.groundGap)).toBe(true);
      expect(Math.abs(frame.groundGap)).toBeLessThanOrEqual(0.03);
    }
  } finally {
    await context.close();
    await browser.close();
  }
});
