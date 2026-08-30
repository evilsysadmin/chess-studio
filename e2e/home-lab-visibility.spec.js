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

async function visibleLabShortcut(page) {
  const moreModes = page.locator('details.home-more-modes');
  await expect(moreModes).not.toHaveAttribute('open', '');

  const lab = page.locator('.home-lab-access > .menu-card-shell > button.home-lab-shortcut');
  await expect(lab).toBeVisible();
  await expect(lab).toContainText('Laboratorio');
  await expect(lab).toContainText('Construye, pega o prueba una posición');

  // Laboratorio ya no vive dentro del disclosure; los secundarios siguen
  // realmente plegados hasta que el usuario los pida.
  await expect(moreModes.getByText('Laboratorio', { exact: true })).toHaveCount(0);
  const secondaryCards = moreModes.locator('.friendly-disclosure-body > .menu-card-shell > button');
  expect(await secondaryCards.count()).toBeGreaterThan(0);
  await expect(secondaryCards.first()).toBeHidden();
  return lab;
}

test('Home · Laboratorio permanece visible sin abrir Más modos de juego', async ({ page }) => {
  await openHome(page);
  const lab = await visibleLabShortcut(page);
  await lab.click();

  await expect(page.getByText('Laboratorio libre', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Prepara una posición y juega', exact: true })).toBeVisible();
});

test('Home móvil · Laboratorio sigue visible y no provoca scroll horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHome(page);
  const lab = await visibleLabShortcut(page);
  await expect(lab).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
