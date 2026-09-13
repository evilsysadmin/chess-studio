import { expect, test } from '@playwright/test';
import { login, mockApi, openMoreGameModes } from './helpers.js';

async function dismissGuide(page) {
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (!(await guide.isVisible().catch(() => false))) return;
  const dismiss = guide.getByRole('button', { name: 'Ahora no', exact: true });
  if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
}

async function openChronicles(page) {
  await mockApi(page);
  await login(page);
  await dismissGuide(page);
  const moreModes = await openMoreGameModes(page);
  await moreModes.getByRole('button').filter({ hasText: 'Experimentos geniales' }).click();
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Chronicles of Matthias/ }).click();
  await expect(page.getByRole('heading', { name: 'Chronicles of Matthias', exact: true })).toBeVisible();
}

test('Chronicles of Matthias · abre una cripta Three.js real y responde a controles', async ({ page }) => {
  await openChronicles(page);
  const mode = page.locator('[data-chronicles="true"]');
  const stage = mode.locator('[data-chronicles-renderer="three"]');
  await expect(stage.locator('canvas')).toBeVisible({ timeout: 30_000 });
  await expect(mode.getByText(/Motor THREE\.JS · FIRST PERSON/)).toBeVisible({ timeout: 30_000 });
  await expect(mode.getByText(/motor 3D no ha arrancado/i)).toHaveCount(0);

  await mode.getByRole('button', { name: 'Avanzar', exact: true }).click();
  await mode.getByRole('button', { name: 'Atacar', exact: true }).click();
  await expect(mode.getByText(/Impacto/i)).toBeVisible();
  await expect(mode.getByText('6/7', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '← Experimentos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
});

test('Chronicles of Matthias · móvil mantiene party y mandos sin overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openChronicles(page);
  const mode = page.locator('[data-chronicles="true"]');
  await expect(mode.getByLabel('Controles de la mazmorra')).toBeVisible();
  for (const name of ['Girar a la izquierda', 'Avanzar', 'Atacar', 'Retroceder', 'Girar a la derecha']) {
    await expect(mode.getByRole('button', { name, exact: true })).toBeVisible();
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
