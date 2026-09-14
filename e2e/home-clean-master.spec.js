import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

test('Home clean master keeps live diegetic Matthias and retired chrome out', async ({ page }) => {
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
  const layeredArt = matthias.locator('[data-matthias-layered-art="true"]');
  const copy = matthias.locator('.illustrated-home__matthias-copy');

  await expect(matthias).toBeVisible();
  await expect(matthias.locator('.illustrated-home__matthias-portrait')).toBeVisible();
  await expect(layeredArt).toBeVisible();
  await expect(copy).toBeVisible();
  await expect(copy.locator('strong')).toHaveText('MATTHIAS');
  await expect(copy.locator('span')).not.toHaveText('');

  // The resident must actually act, not merely render a frozen canonical frame.
  await expect(layeredArt).not.toHaveAttribute('data-gesture-count', '0');
});
