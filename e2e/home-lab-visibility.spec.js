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

async function openLabFromMoreModes(page) {
  const moreModes = page.locator('details.home-more-modes');
  await expect(moreModes).not.toHaveAttribute('open', '');

  // Seleccionamos la tarjeta de modo, no el botón "?" del tutorial de
  // Laboratorio que comparte texto accesible dentro del mismo disclosure.
  const lab = moreModes
    .locator('.friendly-disclosure-body > .menu-card-shell > button')
    .filter({ hasText: 'Laboratorio' });
  await expect(lab).toHaveCount(1);
  await expect(lab).toBeHidden();
  await moreModes.getByText('Más modos de juego', { exact: true }).click();
  await expect(moreModes).toHaveAttribute('open', '');
  await expect(lab).toBeVisible();
  await expect(lab).toContainText('Construye, pega o prueba una posición');
  return lab;
}

test('Home · Laboratorio vive dentro de Más modos de juego', async ({ page }) => {
  await openHome(page);
  await expect(page.locator('.home-lab-access')).toHaveCount(0);
  const lab = await openLabFromMoreModes(page);
  await lab.click();

  await expect(page.getByText('Laboratorio libre', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Prepara una posición y juega', exact: true })).toBeVisible();
});

test('Home móvil · disclosure de Laboratorio no provoca scroll horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHome(page);
  const lab = await openLabFromMoreModes(page);
  await expect(lab).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
