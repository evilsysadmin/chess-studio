import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { activateSetupControl, buttonWithVisibleText, login, mockApi } from './helpers.js';
import { readBoard3DProjection } from './board3d-projection.js';

const VARIANT_KEY = 'chess-study-war-room-variant-v1';
const OUTPUT = '../.artifacts/war-room-render-ab/war-room-v3.json';

function moveCount(log) {
  return log.filter((row) => row.method === 'POST' && /\/games\/[^/]+\/move$/.test(row.path)).length;
}

async function goHome(page) {
  await page.getByRole('button', { name: 'Salir de la partida', exact: true }).click();
  await expect(page.getByRole('heading', { name: '¿Abandonar la partida?', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar sin penalización', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Modos principales', exact: true })).toBeVisible({ timeout: 30_000 });
}

async function sample(page, requestLog, mode, iteration) {
  await page.evaluate((nextMode) => {
    window.__chessWarRoomRenderAB.mode = nextMode;
    window.__chessWarRoomRenderAB.draws.length = 0;
  }, mode);
  await buttonWithVisibleText(page, 'Partida rápida').click();
  const startAt = await page.evaluate(() => performance.now());
  await activateSetupControl(page.getByRole('button', { name: 'Empezar partida', exact: true }));

  const room = page.locator('[data-board3d-war-room="true"]');
  await expect(room).toHaveAttribute('data-board3d-variant', 'v3', { timeout: 90_000 });
  await expect(room).toHaveAttribute('data-board3d-variant-status', 'ready', { timeout: 90_000 });
  await expect(page.locator('[data-war-room-scene-gate]')).toHaveAttribute(
    'data-war-room-scene-gate', 'ready', { timeout: 90_000 },
  );
  const entry = await page.evaluate((started) => {
    const probe = window.__chessWarRoomRenderAB;
    return {
      entryElapsedMs: Math.round(performance.now() - started),
      draws: probe.draws.slice(),
    };
  }, startAt);
  const oldMoves = moveCount(requestLog);
  const canvas = page.locator('.board3d-main-canvas');
  const projected = await readBoard3DProjection(canvas);
  const from = projected.square('e2');
  const to = projected.square('e4');
  await page.mouse.click(from.x, from.y);
  await expect(room).toHaveAttribute('data-board3d-selected', 'e2', { timeout: 15_000 });
  await page.mouse.click(to.x, to.y);
  await expect.poll(() => moveCount(requestLog), { timeout: 20_000 }).toBe(oldMoves + 1);
  const afterMove = await page.evaluate(() => window.__chessWarRoomRenderAB.draws.slice());

  const summarize = (draws) => ({
    total: draws.length,
    effects: draws.filter((row) => row.source === 'effect').length,
    direct: draws.filter((row) => row.source === 'direct').length,
    synchronousCpuMs: Math.round(draws.reduce((total, row) => total + row.synchronousMs, 0)),
  });
  const row = {
    mode, iteration, variant: 'v3',
    entryElapsedMs: entry.entryElapsedMs,
    entry: summarize(entry.draws),
    throughFirstMove: summarize(afterMove),
  };
  console.log('WAR_ROOM_RENDER_AB ' + JSON.stringify(row));
  expect(row.entry.total).toBeGreaterThan(0);
  expect(row.throughFirstMove.total).toBeGreaterThanOrEqual(row.entry.total);
  await goHome(page);
  return row;
}

test('War Room V3 · bench-only ABBA measures actual WebGLRenderer paints', async ({ page }) => {
  test.setTimeout(420_000);
  await page.addInitScript(() => {
    window.__chessWarRoomRenderAB = {
      mode: 'legacy',
      draws: [],
      onDraw(row) {
        // A bounded, same-origin test probe, no production telemetry.
        if (this.draws.length < 1500) this.draws.push(row);
      },
    };
  });
  const requests = [];
  await mockApi(page, {
    requestLog: requests,
    profileSeed: {
      [VARIANT_KEY]: 'v3',
      'matthias.onboarded': '2',
      'chess-study-home-guide-dismissed-v1': '1',
      'chess-study-mechanic-tutorial-progress-v1': JSON.stringify({
        'war-room-basics': { seen: true },
      }),
    },
  });
  await login(page);

  const rows = [];
  for (const mode of ['legacy', 'batched', 'batched', 'legacy']) {
    rows.push(await sample(page, requests, mode, rows.length + 1));
  }
  await mkdir('../.artifacts/war-room-render-ab', { recursive: true });
  const totals = Object.fromEntries(['legacy', 'batched'].map((mode) => {
    const samples = rows.filter((row) => row.mode === mode);
    return [mode, {
      entryPaints: samples.map((row) => row.entry.total),
      firstMovePaints: samples.map((row) => row.throughFirstMove.total),
      entryElapsedMs: samples.map((row) => row.entryElapsedMs),
      renderCpuMs: samples.map((row) => row.throughFirstMove.synchronousCpuMs),
    }];
  }));
  const receipt = { schema: 1, control: 'legacy direct React effect draws', treatment: 'batched RAF draws', rows, totals };
  await writeFile(OUTPUT, JSON.stringify(receipt, null, 2) + '\n', 'utf8');
  console.log('WAR_ROOM_RENDER_AB_SUMMARY ' + JSON.stringify(totals));
});
