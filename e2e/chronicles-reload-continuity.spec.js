import { expect, test } from '@playwright/test';
import { confirmChroniclesCharacterSetup, login, mockApi, openMoreGameModes } from './helpers.js';

test('Chronicles · F5 recupera la run guardada y volver al libro no la reabre', async ({ page }) => {
  test.setTimeout(180_000);
  await mockApi(page, { chroniclesCurrentMapId: 'swordhaven-square', newTown: true });
  await login(page);
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (await guide.isVisible().catch(() => false)) {
    const dismiss = guide.getByRole('button', { name: 'Ahora no', exact: true });
    if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
  }

  const moreModes = await openMoreGameModes(page);
  await moreModes.getByRole('button').filter({ hasText: 'Experimentos geniales' }).click();
  await page.getByRole('button').filter({ hasText: 'Descender a la cripta' }).click();
  const book = page.locator('[data-chronicles-save-menu]');
  await expect(book).toBeVisible();
  await book.getByRole('button', { name: 'Nuevo juego', exact: true }).click();
  await confirmChroniclesCharacterSetup(page, { newTown: true });

  const mode = page.locator('[data-chronicles="true"]');
  await expect(mode).toHaveAttribute('data-chronicles-map-id', 'swordhaven-square');
  const originalRun = await page.evaluate(() => JSON.parse(localStorage.getItem('chess-study-chronicles-run-v1')).id);
  await page.keyboard.press('Escape');
  const gameMenu = mode.locator('.chronicles-game-menu');
  await gameMenu.getByRole('button', { name: 'Guardar partida', exact: true }).click();
  await expect(gameMenu.getByText('Partida guardada correctamente.')).toBeVisible();

  await page.reload();
  await expect(mode).toBeVisible({ timeout: 45_000 });
  await expect(mode).toHaveAttribute('data-chronicles-map-id', 'swordhaven-square');
  const restoredRun = await page.evaluate(() => JSON.parse(localStorage.getItem('chess-study-chronicles-run-v1')).id);
  expect(restoredRun).toBe(originalRun);

  await page.keyboard.press('Escape');
  await mode.locator('.chronicles-game-menu').getByRole('button', { name: 'Partidas guardadas' }).click();
  await expect(book).toBeVisible();
  await page.reload();
  await expect(book).toBeVisible();
  await expect(mode).toHaveCount(0);
});
