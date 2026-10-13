import { expect, test } from '@playwright/test';
import { confirmChroniclesCharacterSetup, login, mockApi, openMoreGameModes } from './helpers.js';

// Regression: a missing JSX component binding used to crash the entire lab
// after Chronicles bootstrap, despite unit tests of the child component passing.
test('Chronicles · full expedition mount has no uncaught render errors', async ({ page }) => {
  test.setTimeout(180_000);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await mockApi(page, { chroniclesCurrentMapId: 'swordhaven-square' });
  await login(page);
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (await guide.isVisible().catch(() => false)) {
    const dismiss = guide.getByRole('button', { name: 'Ahora no', exact: true });
    if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
  }

  const moreModes = await openMoreGameModes(page);
  await moreModes.getByRole('button').filter({ hasText: 'Experimentos geniales' }).click();
  await page.getByRole('button').filter({ hasText: 'Descender a la cripta' }).click();

  const saveMenu = page.locator('[data-chronicles-save-menu]');
  await expect(saveMenu).toBeVisible();
  await saveMenu.getByRole('button', { name: 'Nuevo juego', exact: true }).click();
  await expect(page.locator('[data-chronicles-character-setup]')).toBeVisible();
  await confirmChroniclesCharacterSetup(page, { newTown: true });

  const game = page.locator('[data-chronicles="true"]');
  await expect(game).toBeVisible();
  await expect(game.locator('[data-chronicles-renderer="three"] canvas')).toHaveCount(1);
  await expect(game.locator('.chronicles-renderer-error')).toHaveCount(0);
  expect(pageErrors, 'uncaught error mounting/rendering Chronicles').toEqual([]);
});
