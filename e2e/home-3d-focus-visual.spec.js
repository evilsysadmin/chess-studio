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
  // The WebGL screenshot below deliberately allows 60s for SwiftShader readback.
  // Keep the enclosing Playwright test above that budget so CI does not kill the
  // real capture before screenshot() can reach its own timeout.
  test.setTimeout(90_000);
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
  await expect(home.locator('.illustrated-home__castle-3d.is-ready')).toBeVisible({ timeout: 25_000 });

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
    // SwiftShader can need >30s to read back the live WebGL frame on busy CI runners.
    // Keep the proof real instead of replacing it with a mocked/still canvas.
    timeout: 60_000,
  });

  const tournament = home.locator('.illustrated-home__destination--tournament');
  const alignment = await page.evaluate(() => {
    const stageNode = document.querySelector('.illustrated-home__stage');
    const tournamentNode = document.querySelector('.illustrated-home__destination--tournament');
    const stageRect = stageNode?.getBoundingClientRect();
    const tournamentRect = tournamentNode?.getBoundingClientRect();
    if (!stageRect || !tournamentRect) return null;
    return {
      x: ((tournamentRect.left + (tournamentRect.width / 2)) - stageRect.left) / stageRect.width,
      y: ((tournamentRect.top + (tournamentRect.height / 2)) - stageRect.top) / stageRect.height,
    };
  });

  expect(alignment).not.toBeNull();
  expect(Math.abs(alignment.x - 0.202)).toBeLessThan(0.012);
  expect(Math.abs(alignment.y - 0.322)).toBeLessThan(0.012);

  const stageBox = await stage.boundingBox();
  expect(stageBox).not.toBeNull();
  await page.mouse.move(
    stageBox.x + (stageBox.width * 0.202),
    stageBox.y + (stageBox.height * 0.305),
  );
  await expect(stage).toHaveAttribute('data-home-castle-focus', 'tournament');

  await expect(tournament).toBeVisible();
});
