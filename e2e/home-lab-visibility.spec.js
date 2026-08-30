import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

async function openHome(page) {
  await mockApi(page);
  await login(page);
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (await guide.isVisible().catch(() => false)) {
    await guide.getByRole('button', { name: 'Ahora no', exact: true }).click();
  }
  await expect(page.getByRole('region', { name: 'Hoy en Chess Studio' })).toBeVisible();
}

async function visiblePinnedLab(page) {
  const moreModes = page.locator('details.home-more-modes');
  await expect(moreModes).not.toHaveAttribute('open', '');

  const cards = moreModes.locator('.friendly-disclosure-body > .menu-card-shell');
  const lab = cards.last().getByRole('button', { name: /Laboratorio/i });
  await expect(lab).toBeVisible();

  const secondaryCards = cards.filter({ hasNot: lab });
  for (let index = 0; index < await secondaryCards.count(); index += 1) {
    await expect(secondaryCards.nth(index).locator('button').first()).toBeHidden();
  }
  return lab;
}

test('Home · Laboratorio permanece visible sin abrir Más modos de juego', async ({ page }) => {
  await openHome(page);
  const lab = await visiblePinnedLab(page);
  await lab.click();

  await expect(page.getByText('Laboratorio libre', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Prepara una posición y juega', exact: true })).toBeVisible();
});

test('Home móvil · Laboratorio sigue visible y no provoca scroll horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHome(page);
  const lab = await visiblePinnedLab(page);
  await expect(lab).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
