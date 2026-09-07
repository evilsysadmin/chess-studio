import { expect, test } from '@playwright/test';
import { login, mockApi, startQuickGame } from './helpers.js';

test('Partida rápida 3D renderiza a Hans en la escena real', async ({ page }) => {
  await mockApi(page);
  await login(page);
  await startQuickGame(page);

  await expect(page.locator('[data-board3d-war-room="true"]')).toBeVisible({ timeout: 30_000 });
  const hansMarker = page.locator('[data-war-room-hans-quick-request="true"]');
  await expect(hansMarker).toHaveCount(1);
  await expect(hansMarker).toHaveAttribute('data-war-room-hans-runtime', 'visible', { timeout: 30_000 });
});
