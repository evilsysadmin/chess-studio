import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

async function dismissGuide(page) {
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (await guide.isVisible().catch(() => false)) {
    await guide.getByRole('button', { name: 'Ahora no', exact: true }).click();
  }
}

async function openChesscom(page) {
  await mockApi(page);
  await login(page);
  await dismissGuide(page);
  const moreModes = page.locator('details.home-more-modes');
  if (!(await moreModes.evaluate((node) => node.open))) {
    await moreModes.getByText('Más modos de juego', { exact: true }).click();
  }
  await moreModes
    .locator('.friendly-disclosure-body > .menu-card-shell > button')
    .filter({ hasText: 'Experimentos geniales' })
    .click();
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Chesscom/ }).click();
  await expect(page.getByRole('heading', { name: 'CHESSCOM', exact: true })).toBeVisible();
}

test('Chesscom · abre la planta 17 con renderer Babylon real y HUD Dust Veil', async ({ page }) => {
  await openChesscom(page);

  const mode = page.locator('[data-chesscom-poc="true"][data-chesscom-renderer="babylon"]');
  await expect(mode).toBeVisible();
  await expect(mode.getByText('OPERATION: DUST VEIL', { exact: true })).toBeVisible();
  await expect(mode.getByText('Kharif Outpost', { exact: true })).toBeVisible();
  await expect(mode.getByText('HK416 (Used)', { exact: true })).toBeVisible();
  await expect(mode.getByText('3.400 cr', { exact: true })).toBeVisible();

  const canvas = mode.locator('.chesscom-babylon-host canvas');
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await expect(mode.getByText('BABYLON.JS 9.25.0', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(mode.getByText('BABYLON · ERROR', { exact: true })).toHaveCount(0);

  await expect(mode.getByRole('button', { name: 'Move', exact: true })).toBeVisible();
  await expect(mode.getByRole('button', { name: 'Shoot', exact: true })).toBeVisible();
  await expect(mode.getByRole('button', { name: 'Overwatch', exact: true })).toBeVisible();
  await expect(mode.getByRole('button', { name: 'End turn', exact: true })).toBeVisible();
});

test('Chesscom · conserva la salida limpia hacia Experimentos', async ({ page }) => {
  await openChesscom(page);
  await page.getByRole('button', { name: '← Experimentos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Chesscom/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Pawn Slug/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Pawn Trailblazer/ })).toBeVisible();
});
