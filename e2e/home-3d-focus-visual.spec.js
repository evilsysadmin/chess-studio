import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { login, mockApi } from './helpers.js';

const ARTIFACT_DIR = '../.artifacts/app-visual';

test.use({
  viewport: { width: 1440, height: 900 },
  launchOptions: {
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
    ],
  },
});

test('Home 3D · captura Combat con foco físico', async ({ page }) => {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      configurable: true,
      get: () => 8,
    });
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await mockApi(page, {
    profileSeed: {
      'matthias.onboarded': '2',
      'chess-study-home-guide-dismissed-v1': '1',
    },
  });
  await login(page);

  const home = page.getByRole('region', { name: 'Modos principales' });
  const stage = home.locator('.illustrated-home__stage');
  await expect(home).toBeVisible();
  await expect(stage).toBeVisible();
  await expect(home.locator('.illustrated-home__castle-3d.is-ready')).toBeVisible({ timeout: 15_000 });

  const combat = home.locator('.illustrated-home__destination--combat');
  await combat.hover();
  await expect(stage).toHaveAttribute('data-home-castle-focus', 'combat');

  // Room light + emissive prop focus use restrained lerps. Give them enough
  // real frames to settle before capturing the interaction state.
  await page.waitForTimeout(650);
  await page.screenshot({
    path: `${ARTIFACT_DIR}/home-desktop-1440x900-combat-focus.png`,
    fullPage: false,
    animations: 'disabled',
  });
});
