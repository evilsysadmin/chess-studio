import { expect, test } from '@playwright/test';
import { login, mockApi, openMoreGameModes } from './helpers.js';

async function dismissGuide(page) {
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (!(await guide.isVisible().catch(() => false))) return;
  const dismiss = guide.getByRole('button', { name: 'Ahora no', exact: true });
  if (await dismiss.isVisible().catch(() => false)) {
    await dismiss.click();
    return;
  }
  const close = guide.getByRole('button', { name: 'Cerrar guía rápida', exact: true });
  if (await close.isVisible().catch(() => false)) await close.click();
}

async function dismissMatthiasSpeech(page) {
  const speech = page.getByRole('region', { name: 'Mensaje de Matthias', exact: true });
  if (!(await speech.isVisible().catch(() => false))) return;
  const close = speech.getByRole('button', { name: 'Cerrar comentario de Matthias', exact: true });
  if (await close.isVisible().catch(() => false)) await close.click({ force: true });
}

async function openPawnSlug(page) {
  await mockApi(page);
  await login(page);
  await dismissGuide(page);
  await dismissMatthiasSpeech(page);
  await openMoreGameModes(page);

  const moreModes = page.locator('#illustrated-home-tools');
  await expect(moreModes).toBeVisible();
  await moreModes.getByRole('button').filter({ hasText: 'Experimentos geniales' }).click();
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Pawn Slug/ }).click();
  await expect(page.getByRole('heading', { name: 'Pawn Slug', exact: true })).toBeVisible();
}

async function startPawnSlug(page) {
  await page.getByRole('button', { name: 'INICIAR OPERACIÓN', exact: true }).click();
  await expect(page.getByRole('button', { name: 'INICIAR OPERACIÓN', exact: true })).toHaveCount(0);
  await expect(page.getByText('Dienstpistole', { exact: true })).toBeVisible();
}

async function missionProgress(page) {
  const label = await page.locator('.pawn-slug-mission-progress').getAttribute('aria-label');
  const match = String(label || '').match(/(\d+)%/);
  return Number(match?.[1] || 0);
}

async function runAndGunToProgress(page, targetPercent) {
  const deadline = Date.now() + 35_000;
  await page.keyboard.down('ArrowRight');
  await page.keyboard.down('Space');
  try {
    while (Date.now() < deadline) {
      const progress = await missionProgress(page);
      if (progress >= targetPercent) return progress;
      // Jump often enough to exercise real movement/landing while avoiding a
      // deterministic straight-line suicide march through every firing lane.
      await page.keyboard.press('ShiftLeft');
      await page.waitForTimeout(650);
    }
  } finally {
    await page.keyboard.up('Space');
    await page.keyboard.up('ArrowRight');
  }
  throw new Error(`Pawn Slug no alcanzó ${targetPercent}% con controles reales; progreso=${await missionProgress(page)}%`);
}

test('Pawn Slug · checkpoint, boss, reinicio, F5 y vuelta al laboratorio dejan el runtime limpio', async ({ page }) => {
  // One premium Three.js boot now crosses a real checkpoint and reaches the
  // Panzer-Rook encounter before proving restart/reload/re-entry cleanup.
  test.setTimeout(175_000);
  await openPawnSlug(page);
  await startPawnSlug(page);

  const stage = page.locator('[data-pawn-slug-renderer="three"]');
  const canvas = stage.locator('canvas');
  await expect(canvas).toHaveCount(1);
  await expect(canvas).toBeVisible({ timeout: 30_000 });

  const checkpointProgress = await runAndGunToProgress(page, 30);
  expect(checkpointProgress).toBeGreaterThanOrEqual(30);
  await expect(page.locator('.pawn-slug-mission-progress')).toHaveAttribute('aria-label', /Progreso de misión (?:3\d|[4-9]\d|100)%/);

  const bossEntryProgress = await runAndGunToProgress(page, 80);
  expect(bossEntryProgress).toBeGreaterThanOrEqual(80);
  await expect(page.getByText('PANZER-ROOK · KOMMANDANTENBURG', { exact: true })).toBeVisible({ timeout: 5_000 });

  await page.getByRole('button', { name: 'Abrir ajustes de Pawn Slug', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Pawn Slug Settings' });
  await expect(settings).toBeVisible();
  await settings.getByRole('button', { name: 'Reiniciar misión', exact: true }).click();
  await expect(settings).toHaveCount(0);
  await expect(canvas).toHaveCount(1);
  await expect(canvas).toBeVisible();
  await expect(page.getByText('Dienstpistole', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Progreso de misión 0%')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Pawn Slug', exact: true })).toBeVisible();
  const reloadedStage = page.locator('[data-pawn-slug-renderer="three"]');
  await expect(reloadedStage.locator('canvas')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'INICIAR OPERACIÓN', exact: true })).toBeVisible();

  await page.getByRole('button', { name: '← Experimentos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Pawn Slug/ }).click();
  await expect(page.getByRole('heading', { name: 'Pawn Slug', exact: true })).toBeVisible();
  await expect(page.locator('[data-pawn-slug-renderer="three"] canvas')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'INICIAR OPERACIÓN', exact: true })).toBeVisible();
});
