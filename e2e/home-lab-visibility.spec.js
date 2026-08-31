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

async function openExperimentsFromMoreModes(page) {
  const moreModes = page.locator('details.home-more-modes');
  await expect(moreModes).not.toHaveAttribute('open', '');

  const experiments = moreModes
    .locator('.friendly-disclosure-body > .menu-card-shell > button')
    .filter({ hasText: 'Experimentos geniales' });
  await expect(experiments).toHaveCount(1);
  await expect(experiments).toBeHidden();
  await moreModes.getByText('Más modos de juego', { exact: true }).click();
  await expect(moreModes).toHaveAttribute('open', '');
  await expect(experiments).toBeVisible();
  await expect(experiments).toContainText('Pawn Trailblazer');
  return experiments;
}

test('Home · aprendizaje secundario queda abierto y Experimentos geniales abre el hangar', async ({ page }) => {
  await openHome(page);

  const learning = page.locator('details.home-learning-more');
  await expect(learning).toHaveAttribute('open', '');
  await expect(learning.getByRole('heading', { name: 'Puzzles', exact: true })).toBeVisible();

  const experiments = await openExperimentsFromMoreModes(page);
  await experiments.click();

  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Ajedrez 3D/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Pawn Trailblazer/ })).toBeVisible();
});

test('Pawn Trailblazer · la POC arranca y expone sus controles', async ({ page }) => {
  await openHome(page);
  const experiments = await openExperimentsFromMoreModes(page);
  await experiments.click();
  await page.getByRole('button', { name: /Pawn Trailblazer/ }).click();

  await expect(page.getByRole('heading', { name: 'Pawn Trailblazer', exact: true })).toBeVisible();
  await expect(page.locator('[data-pawn-trailblazer="true"] canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Iniciar carrera', exact: true })).toBeVisible();
  await expect(page.getByText('Nací peón. Siempre seré peón.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Iniciar carrera', exact: true }).click();
  await expect(page.getByText('Iniciar carrera', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Synthmetal', { exact: true })).toBeVisible();
  await expect(page.getByText('Clásica', { exact: true })).toBeVisible();
});

test('Home móvil · Experimentos geniales no provoca scroll horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHome(page);
  const experiments = await openExperimentsFromMoreModes(page);
  await expect(experiments).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
