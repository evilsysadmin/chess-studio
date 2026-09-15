import { expect, test } from '@playwright/test';
import { buttonWithVisibleText, login, mockApi } from './helpers.js';
import { WAR_ROOM_CAT_VERSION } from '../frontend/src/components/WarRoomCatDecor.js';

test('War Room · el gato existe una vez y llega realmente al render', async ({ page }) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await mockApi(page, {
    profileSeed: {
      'matthias.onboarded': '2',
      'chess-study-home-guide-dismissed-v1': '1',
    },
  });
  await login(page);

  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expect(page.locator('.board-live-row.is-3d-warroom')).toBeVisible({ timeout: 45_000 });

  const canvas = page.locator('.board3d-main-canvas');
  await expect(canvas).toBeVisible({ timeout: 45_000 });
  await expect(canvas).toHaveAttribute('data-war-room-cat-rendered', 'true', { timeout: 45_000 });
  await expect(canvas).toHaveAttribute('data-war-room-cat-version', WAR_ROOM_CAT_VERSION);
  await expect(canvas).toHaveAttribute('data-war-room-cat-count', '1');
  await expect(canvas).toHaveAttribute('data-war-room-cat-placement', /^(left|right)-sofa-sleeper-v1$/);
  await expect(canvas).toHaveAttribute('data-war-room-cat-sofa-side', /^(left|right)$/);
  await expect(canvas).toHaveAttribute('data-war-room-cat-motion', /^(ambient-idle|resting-static)$/);
});
