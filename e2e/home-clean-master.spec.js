import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

test('Home clean master keeps live Matthias and retired chrome out', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApi(page, {
    profileSeed: {
      'matthias.onboarded': '2',
      'chess-study-home-guide-dismissed-v1': '1',
    },
  });
  await login(page);

  const home = page.getByRole('region', { name: 'Modos principales' });
  await expect(home).toBeVisible();
  await expect(home.locator('.illustrated-home__brand')).toHaveCount(0);
  await expect(home.locator('.illustrated-home__motto')).toHaveCount(0);

  for (const id of ['tournament', 'train', 'combat', 'daily', 'history', 'play']) {
    await expect(home.locator(`.illustrated-home__destination--${id}`)).toBeVisible();
  }

  const matthias = home.locator('.illustrated-home__matthias');
  await expect(matthias).toBeVisible();
  await expect(matthias.locator('.illustrated-home__matthias-portrait')).toBeVisible();
  await expect(matthias.locator('[data-matthias-layered-art="true"]')).toBeVisible();
  await expect(matthias.locator('.illustrated-home__matthias-copy')).toBeHidden();
});
