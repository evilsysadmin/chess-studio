import { expect, test } from '@playwright/test';
import {
  dismissTutorialIfVisible,
  login,
  mockApi,
  openCampaignBriefing,
} from './helpers.js';

test('Combat Chess · el tablero de preparación conduce al despliegue editable', async ({ page }) => {
  await mockApi(page);
  await login(page);
  await openCampaignBriefing(page);
  await page.getByRole('button', { name: /PREPARAR EJÉRCITO/i }).click();
  await dismissTutorialIfVisible(page);

  const room = page.locator('[data-combat-preparation-room="combat-operations-room"]');
  await expect(room).toBeVisible({ timeout: 45_000 });
  const edit = room.getByRole('button', { name: 'Editar formación desde el tablero' });
  await expect(edit).toBeVisible();
  await expect(page.getByRole('button', { name: /JUGAR CON (ESTA|FORMACIÓN RECOMENDADA)/i })).toBeVisible();

  await edit.click();
  await expect(page.locator('[data-combat-deployment="war-table"]')).toBeVisible();
});
