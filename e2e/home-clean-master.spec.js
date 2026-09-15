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
  const rig = canonicalHost.locator('[data-matthias-layered-art="true"]');
  const copy = matthias.locator('.illustrated-home__matthias-copy');

  await expect(matthias).toBeVisible();
  await expect(portrait).toBeVisible();
  await expect(canonicalHost).toHaveAttribute('data-home-matthias-3d', 'ready');
  await expect(canonicalHost).toHaveAttribute('data-matthias-identity', 'canonical-render-rig');
  await expect(canonicalHost).toHaveAttribute('data-motion', 'layered-canonical-rig');
  await expect(rig).toBeVisible();
  await expect(rig.locator('[data-matthias-canonical-art="true"]')).toBeVisible();
  await expect(rig.locator('[data-matthias-art-part]')).toHaveCount(5);
  await expect(copy).toBeVisible();
  await expect(copy.locator('strong')).toHaveText('MATTHIAS');
  await expect(copy.locator('span')).not.toHaveText('');

  // The approved 3D/CG render stays visually canonical while the layered rig
  // gives the current routine a real one-shot gesture instead of redrawing him.
  await expect(rig).toHaveAttribute('data-gesture-profile', 'expressive-v2');
  await expect.poll(async () => Number(await rig.getAttribute('data-gesture-count')), {
    timeout: 3_000,
  }).toBeGreaterThan(0);
});
