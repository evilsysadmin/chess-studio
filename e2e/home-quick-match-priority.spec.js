import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

async function openHome(page) {
  await mockApi(page);
  await login(page);
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (await guide.isVisible().catch(() => false)) {
    await guide.getByRole('button', { name: 'Ahora no', exact: true }).click();
  }
  await expect(page.getByRole('region', { name: 'Modos principales', exact: true })).toBeVisible();
}

async function expectQuickMatchAboveFold(page, viewport) {
  await page.setViewportSize(viewport);
  await openHome(page);

  const modes = page.getByRole('region', { name: 'Modos principales', exact: true });
  const firstMode = modes.locator('.home-primary-grid > .menu-card-shell > button').first();
  await expect(firstMode).toContainText('Partida rápida');
  await expect(firstMode).toContainText('Jugar ahora');

  const quickTitle = firstMode.getByRole('heading', { name: 'Partida rápida', exact: true });
  const titleBox = await quickTitle.boundingBox();
  expect(titleBox).not.toBeNull();
  expect(titleBox.y).toBeGreaterThanOrEqual(0);
  expect(titleBox.y + titleBox.height).toBeLessThanOrEqual(viewport.height);

  const hierarchy = await page.evaluate(() => {
    const modesSection = document.querySelector('.home-modes-section');
    const today = document.querySelector('.home-today-card');
    const quick = document.querySelector('.home-mode-quick');
    const tournament = document.querySelector('.home-mode-featured');
    const follows = (first, second) => Boolean(first && second && (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING));
    return {
      modesBeforeToday: follows(modesSection, today),
      quickBeforeTournament: follows(quick, tournament),
    };
  });

  expect(hierarchy.modesBeforeToday).toBe(true);
  expect(hierarchy.quickBeforeTournament).toBe(true);
}

test('Home desktop · Partida rápida queda visible sin scroll y lidera Jugar', async ({ page }) => {
  await expectQuickMatchAboveFold(page, { width: 1552, height: 900 });
});

test('Home móvil · Partida rápida sigue visible sin scroll y es la primera opción', async ({ page }) => {
  await expectQuickMatchAboveFold(page, { width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
