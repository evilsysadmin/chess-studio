import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

async function dismissGuide(page) {
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (await guide.isVisible().catch(() => false)) {
    await guide.getByRole('button', { name: 'Ahora no', exact: true }).click();
  }
}

async function openPawnSlug(page) {
  await mockApi(page);
  await login(page);
  await dismissGuide(page);
  const moreModes = page.locator('details.home-more-modes');
  if (!(await moreModes.evaluate((node) => node.open))) {
    await moreModes.getByText('Más modos de juego', { exact: true }).click();
  }
  const experiments = moreModes
    .locator('.friendly-disclosure-body > .menu-card-shell > button')
    .filter({ hasText: 'Experimentos geniales' });
  await experiments.click();
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Pawn Slug/ }).click();
  await expect(page.getByRole('heading', { name: 'Pawn Slug', exact: true })).toBeVisible();
}

test('Pawn Slug · arranca como misión Three.js aislada del ajedrez competitivo', async ({ page }) => {
  await openPawnSlug(page);

  const stage = page.locator('[data-pawn-slug-renderer="three"]');
  await expect(stage).toBeVisible();
  await expect(stage.locator('canvas')).toBeVisible();
  await expect(page.getByText('BAUERNSCHLAG', { exact: true })).toBeVisible();
  await expect(page.getByText(/Cero ELO/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'INICIAR OPERACIÓN', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'INICIAR OPERACIÓN', exact: true }).click();
  await expect(page.getByRole('button', { name: 'INICIAR OPERACIÓN', exact: true })).toHaveCount(0);
  await expect(page.getByText('Dienstpistole', { exact: true })).toBeVisible();
  await expect(page.getByText('OPERACIÓN BAUERNSCHLAG', { exact: true })).toBeVisible();
});

test('Pawn Slug · móvil expone controles táctiles grandes sin overflow horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPawnSlug(page);
  await page.getByRole('button', { name: 'INICIAR OPERACIÓN', exact: true }).click();

  const controls = page.getByLabel('Controles táctiles de Pawn Slug');
  await expect(controls).toBeVisible();
  for (const name of ['Izquierda', 'Derecha', 'Agacharse', 'Saltar', 'Disparar', 'Granada']) {
    const button = page.getByRole('button', { name, exact: true });
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect(box.height).toBeGreaterThanOrEqual(50);
  }

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('Pawn Slug · conserva el camino de vuelta al hangar', async ({ page }) => {
  await openPawnSlug(page);
  await page.getByRole('button', { name: '← Experimentos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Pawn Slug/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Pawn Trailblazer/ })).toBeVisible();
});
