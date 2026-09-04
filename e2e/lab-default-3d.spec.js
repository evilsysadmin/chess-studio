import { expect, test } from '@playwright/test';
import { buttonWithHeading, login, mockApi, openMoreGameModes } from './helpers.js';

test('Laboratorio libre · el editor honra el renderer 3D global', async ({ page }) => {
  await mockApi(page, {
    profileSeed: {
      'chess-study-board-renderer': '3d',
    },
  });
  await login(page);

  const moreModes = await openMoreGameModes(page);
  await buttonWithHeading(moreModes, 'Laboratorio').click();
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();

  await buttonWithHeading(page, 'Laboratorio libre').click();
  await expect(page.getByRole('heading', { name: 'Prepara una posición y juega', exact: true })).toBeVisible();
  await expect(page.locator('.lab-board-editor [data-board3d-war-room="true"]')).toBeVisible({ timeout: 30_000 });
});
