import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

// Regression fixture: one legal black-to-move personal puzzle. The view must
// choose the black-side camera, exactly as in the reported Replay screenshot.
const BLACK_REPLAY_PUZZLE = {
  id: 'black-replay-occlusion-regression',
  kind: 'personal',
  source: 'autopsy',
  title: 'Replay negro: tablero visible',
  description: 'El tablero completo sigue visible jugando con negras.',
  fen: 'r5k1/8/8/8/8/8/5PPP/6K1 b - - 0 1',
  solution: ['Ra1#'],
  sourceGameId: 'black-replay-occlusion-source',
  loss: 400,
  createdAt: '2026-10-23T18:00:00Z',
  attempts: 0,
  solves: 0,
  cleanSolves: 0,
};

test('Replay personal · negras mantiene escena jugable en desktop y portrait', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApi(page, {
    profileSeed: {
      'matthias.onboarded': '2',
      'chess-study-home-guide-dismissed-v1': '1',
      'chess-study-personal-puzzles': JSON.stringify([BLACK_REPLAY_PUZZLE]),
    },
  });
  await login(page);

  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  const dismiss = guide.getByRole('button', { name: 'Ahora no', exact: true });
  if (await dismiss.isVisible().catch(() => false)) await dismiss.click();

  await expect(page.locator('.illustrated-home')).toBeVisible();
  await page.getByRole('button', { name: 'Más modos y herramientas · Mazmorras', exact: true }).click();
  await page.getByRole('button', { name: 'Puzzles clásicos', exact: true }).click();

  const replay = page.locator('.puzzle-screen');
  await expect(replay).toBeVisible();
  await replay.locator('.puzzle-source-picker > summary').click();
  await replay.getByRole('group', { name: 'Tipo de puzzle' })
    .getByRole('button', { name: /^Acciones inmediatas/ }).click();

  await expect(replay.getByRole('heading', { name: BLACK_REPLAY_PUZZLE.title })).toBeVisible();
  await expect(replay.getByText(/Juegas con negras/)).toBeVisible();

  const shell = replay.locator('[data-board3d-camera="training-room-overhead"]');
  const canvas = replay.locator('.board3d-main-canvas');
  await expect(shell).toBeVisible({ timeout: 30_000 });
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await expect(canvas).toHaveAttribute('data-training-room-scene', 'insights-training-room-v3-copy-safe-study');
  await expect(canvas).toHaveAttribute('data-board3d-view-projection', /./, { timeout: 30_000 });

  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(canvas).toBeVisible();
    await expect(replay.getByText(/Juegas con negras/)).toBeVisible();
    const dimensions = await canvas.boundingBox();
    expect(dimensions?.width || 0).toBeGreaterThanOrEqual(viewport.width * 0.98);
    expect(dimensions?.height || 0).toBeGreaterThanOrEqual(viewport.height * 0.98);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const png = await page.screenshot({ animations: 'disabled', fullPage: false });
    await mkdir('../.artifacts/app-visual', { recursive: true });
    await writeFile(`../.artifacts/app-visual/training-replay-black-${viewport.width}x${viewport.height}.png`, png);
    await testInfo.attach(`replay-black-${viewport.width}x${viewport.height}`, {
      body: png,
      contentType: 'image/png',
    });
  }
});
