import { expect, test } from '@playwright/test';
import { login, mockApi, startQuickGame } from './helpers.js';

test('Partida rápida 3D solicita la aparición forzada de Hans', async ({ page }) => {
  await mockApi(page);
  await login(page);
  await startQuickGame(page);

  await expect(page.locator('[data-board3d-war-room="true"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-war-room-hans-quick-request="true"]')).toHaveCount(1);
});
