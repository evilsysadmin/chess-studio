import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

test('Home clean master keeps live diegetic Matthias and retired chrome out', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
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
  const portrait = matthias.locator('.illustrated-home__matthias-portrait');
  const canonicalHost = portrait.locator('[data-home-matthias-3d]');
  const image = canonicalHost.locator('img');
  const copy = matthias.locator('.illustrated-home__matthias-copy');

  await expect(matthias).toBeVisible();
  await expect(portrait).toBeVisible();
  await expect(canonicalHost).toHaveAttribute('data-home-matthias-3d', 'ready');
  await expect(canonicalHost).toHaveAttribute('data-matthias-identity', 'canonical-scene-render');
  await expect(canonicalHost).toHaveAttribute('data-matthias-render-source', 'bundled-scene-art');
  await expect(canonicalHost).toHaveAttribute('data-motion', 'canonical-sprite-routines');
  await expect(canonicalHost).toHaveAttribute('data-home-matthias-profile', /^(idle|sip|bite|think|write|dossier|read|sleep|speak)$/);
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute('data-matthias-identity', 'canonical-scene-render');
  await expect(canonicalHost.locator('canvas')).toHaveCount(0);
  await expect(canonicalHost.locator('[data-matthias-layered-art="true"]')).toHaveCount(0);
  await expect(copy).toBeVisible();
  await expect(copy.locator('strong')).toHaveText('MATTHIAS');
  await expect(copy.locator('span')).not.toHaveText('');

  const animationName = await image.evaluate((node) => getComputedStyle(node).animationName);
  expect(animationName).not.toBe('none');
});
