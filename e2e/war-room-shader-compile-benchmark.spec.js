import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { activateSetupControl, buttonWithVisibleText, login, mockApi } from './helpers.js';
import { readBoard3DProjection } from './board3d-projection.js';

const KEY = 'chess-study-war-room-variant-v1';
const OUTPUT = '../.artifacts/war-room-shader-ab/v3.json';

function moveCount(rows) {
  return rows.filter((row) => row.method === 'POST' && /\/games\/[^/]+\/move$/.test(row.path)).length;
}
async function goHome(page) {
  await page.getByRole('button', { name: 'Salir de la partida', exact: true }).click();
  await expect(page.getByRole('heading', { name: '¿Abandonar la partida?', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar sin penalización', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Modos principales', exact: true })).toBeVisible({ timeout: 30_000 });
}
async function sample(page, log, mode, index) {
  await page.evaluate((next) => {
    window.__chessWarRoomShaderAB.mode = next;
    window.__chessWarRoomShaderAB.samples.length = 0;
    window.__chessWarRoomShaderAB.parallelCompile = null;
  }, mode);
  await buttonWithVisibleText(page, 'Partida rápida').dispatchEvent('click');
  const t0 = await page.evaluate(() => performance.now());
  await activateSetupControl(page.getByRole('button', { name: 'Empezar partida', exact: true }));
  const room = page.locator('[data-board3d-war-room="true"]');
  const canvas = page.locator('.board3d-main-canvas');
  await expect(room).toHaveAttribute('data-board3d-variant', 'v3', { timeout: 90_000 });
  await expect(room).toHaveAttribute('data-board3d-variant-status', 'ready', { timeout: 90_000 });
  await expect(page.locator('[data-war-room-scene-gate]')).toHaveAttribute(
    'data-war-room-scene-gate', 'ready', { timeout: 90_000 },
  );
  const measurements = await page.evaluate((started) => {
    const ds = document.querySelector('canvas.board3d-main-canvas')?.dataset || {};
    const probe = window.__chessWarRoomShaderAB;
    return {
      entryMs: Math.round(performance.now() - started),
      firstWebGLDrawMs: Number(ds.warRoomShellTimingRenderMs || -1),
      readyPaintMs: Number(ds.warRoomShellTimingReadyPaintMs || -1),
      glbMs: Number(ds.warRoomShellTimingGlbMs || -1),
      shaderSamples: probe.samples.slice(),
    };
  }, t0);
  const before = moveCount(log);
  const projection = await readBoard3DProjection(canvas);
  const from = projection.square('e2');
  const to = projection.square('e4');
  await page.mouse.click(from.x, from.y);
  await expect(room).toHaveAttribute('data-board3d-selected', 'e2', { timeout: 15_000 });
  await page.mouse.click(to.x, to.y);
  await expect.poll(() => moveCount(log), { timeout: 20_000 }).toBe(before + 1);
  const row = { mode, index, ...measurements, playedE2E4: true };
  console.log('WAR_ROOM_SHADER_AB ' + JSON.stringify(row));
  expect(row.firstWebGLDrawMs).toBeGreaterThanOrEqual(0);
  await goHome(page);
  return row;
}
test('War Room V3 shader compile ABBA diagnostic — first draw and first legal move', async ({ page }) => {
  test.setTimeout(420_000);
  await page.addInitScript(({ key }) => { window.localStorage.setItem(key, 'v3'); }, { key: KEY });
  await page.addInitScript(() => {
    window.__chessWarRoomShaderAB = { mode: 'control', parallelCompile: null, samples: [] };
  });
  const log = [];
  await mockApi(page, {
    requestLog: log,
    profileSeed: {
      [KEY]: 'v3',
      'matthias.onboarded': '2',
      'chess-study-home-guide-dismissed-v1': '1',
      'chess-study-mechanic-tutorial-progress-v1': JSON.stringify({
        'war-room-basics': { seen: true },
      }),
    },
  });
  await login(page);
  const results = [];
  for (const mode of ['control', 'prepared', 'prepared', 'control']) {
    results.push(await sample(page, log, mode, results.length + 1));
  }
  const totals = Object.fromEntries(['control', 'prepared'].map((mode) => [mode, results
    .filter((row) => row.mode === mode)
    .map(({ entryMs, firstWebGLDrawMs, readyPaintMs, shaderSamples }) => ({
      entryMs, firstWebGLDrawMs, readyPaintMs, shaderSamples,
    }))]));
  await mkdir('../.artifacts/war-room-shader-ab', { recursive: true });
  await writeFile(OUTPUT, JSON.stringify({ schema: 1, results, totals }, null, 2) + '\n');
  console.log('WAR_ROOM_SHADER_AB_SUMMARY ' + JSON.stringify(totals));
});
