import { expect, test } from '@playwright/test';
import { login, mockApi, openMoreGameModes } from './helpers.js';

async function dismissGuide(page) {
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (!(await guide.isVisible().catch(() => false))) return;
  const dismiss = guide.getByRole('button', { name: 'Ahora no', exact: true });
  if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
}

async function openTactics(page) {
  await mockApi(page);
  await login(page);
  await dismissGuide(page);
  const moreModes = await openMoreGameModes(page);
  await moreModes.getByRole('button').filter({ hasText: 'Experimentos geniales' }).click();
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
  await page.getByRole('button').filter({ hasText: 'Abrir la mesa táctica' }).click();
  await expect(page.getByRole('heading', { name: 'Chronicles of Matthias Tactics', exact: true })).toBeVisible();
}

test('Chronicles Tactics · arranca como action RPG isométrico con usar, ataque y clases distintas', async ({ page }) => {
  await openTactics(page);
  const mode = page.locator('[data-chronicles-tactics="true"]');
  const canvas = mode.locator('[data-chronicles-tactics-renderer="three"] canvas');
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await expect(mode).toHaveAttribute('data-camera', 'isometric-behind-party');
  await expect(mode).toHaveAttribute('data-combat', 'realtime');
  await expect(mode.getByText(/cuatro clases, cuatro geometrías de combate/i)).toBeVisible();
  await expect(mode.getByText(/Espadachín · Espada corta/i)).toBeVisible();
  await expect(mode.getByText(/Taumaturgo · Farol rúnico/i)).toBeVisible();
  await expect(mode.getByText(/Hostigador · Ballesta de estribo/i)).toBeVisible();
  await expect(mode.getByText(/espacio usa · Shift ataca/i)).toBeVisible();
  await expect(mode.getByRole('button', { name: 'Usar', exact: true })).toBeVisible();
  await expect(mode.getByRole('button', { name: 'Esperar', exact: true })).toHaveCount(0);

  await page.keyboard.press('2');
  await page.keyboard.press('Shift');
  await expect(mode.getByText(/Hildegard usa embestida de torre/i)).toBeVisible();
});

test('Chronicles Tactics · móvil conserva canvas y controles de acción sin overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTactics(page);
  const mode = page.locator('[data-chronicles-tactics="true"]');
  await expect(mode.locator('[data-chronicles-tactics-renderer="three"] canvas')).toBeVisible({ timeout: 30_000 });
  await expect(mode.getByRole('button', { name: 'Mover al norte' })).toBeVisible();
  await expect(mode.getByRole('button', { name: 'Mover al oeste' })).toBeVisible();
  await expect(mode.getByRole('button', { name: 'Usar', exact: true })).toBeVisible();
  await expect(mode.getByRole('button', { name: 'Atacar', exact: true })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
