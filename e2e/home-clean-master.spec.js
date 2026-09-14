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
  const avatar3d = portrait.locator('[data-home-matthias-3d]');
  const canvas = avatar3d.locator('canvas');
  const copy = matthias.locator('.illustrated-home__matthias-copy');

  await expect(matthias).toBeVisible();
  await expect(portrait).toBeVisible();
  await expect(avatar3d).toHaveAttribute('data-home-matthias-3d', 'ready');
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute('data-motion', 'procedural-3d');
  await expect(copy).toBeVisible();
  await expect(copy.locator('strong')).toHaveText('MATTHIAS');
  await expect(copy.locator('span')).not.toHaveText('');

  // Home must render the real Three.js Matthias model. The old layered bitmap
  // rig literally shook the portrait rectangle and made him read as a sticker.
  await expect(matthias.locator('[data-matthias-layered-art="true"]')).toHaveCount(0);
  await expect(matthias.locator('[data-matthias-art-part]')).toHaveCount(0);

  // The procedural rig keeps moving even between explicit Home routine changes.
  // motionTick is emitted sparsely by the render loop so the test verifies that
  // WebGL is alive without depending on fragile pixel diffs.
  const firstTick = Number(await canvas.getAttribute('data-motion-tick'));
  await expect.poll(async () => Number(await canvas.getAttribute('data-motion-tick')), {
    timeout: 3_000,
  }).toBeGreaterThan(firstTick);
});
