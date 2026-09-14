import { expect, test } from '@playwright/test';
import { mockApi } from './helpers.js';

const PROFILE_SEED = {
  'matthias.onboarded': '2',
  'chess-study-home-guide-dismissed-v1': '1',
};

async function loginWithHomeFramesHeld(page) {
  await page.goto('./');
  await page.evaluate(() => window.__homeFrameGate.hold());
  await page.getByLabel('Usuario').fill('e2e');
  const password = page.getByLabel('Contraseña');
  await password.fill('clave123456');
  await password.press('Enter');
  await expect(page.getByRole('region', { name: 'Modos principales', exact: true })).toBeVisible();
}

test('Home 3D mantiene el fallback hasta pintar el primer frame texturizado', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      configurable: true,
      get: () => 8,
    });

    const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
    const nativeCancelAnimationFrame = window.cancelAnimationFrame.bind(window);
    const heldFrames = new Map();
    let holding = false;
    let nextHeldId = -1;

    window.__homeFrameGate = {
      hold() {
        holding = true;
      },
      release() {
        holding = false;
        const callbacks = [...heldFrames.values()];
        heldFrames.clear();
        for (const callback of callbacks) nativeRequestAnimationFrame(callback);
      },
    };

    window.requestAnimationFrame = (callback) => {
      if (!holding) return nativeRequestAnimationFrame(callback);
      const id = nextHeldId;
      nextHeldId -= 1;
      heldFrames.set(id, callback);
      return id;
    };

    window.cancelAnimationFrame = (id) => {
      if (id < 0) {
        heldFrames.delete(id);
        return;
      }
      nativeCancelAnimationFrame(id);
    };
  });

  await mockApi(page, { profileSeed: PROFILE_SEED });
  await loginWithHomeFramesHeld(page);

  const home = page.getByRole('region', { name: 'Modos principales', exact: true });
  const art = home.locator('.illustrated-home__art');
  const canvas = home.locator('.illustrated-home__castle-3d');

  await expect(canvas).toHaveCount(1);
  await expect.poll(() => art.evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
  await page.waitForTimeout(150);

  // Texture loading may already be complete, but no WebGL frame has been
  // allowed through. The canonical image must therefore still be the visible
  // safety net; marking the canvas ready here recreates the blank-Home race.
  await expect(canvas).not.toHaveClass(/is-ready/);
  await expect(art).toHaveCSS('opacity', '1');

  await page.evaluate(() => window.__homeFrameGate.release());
  await expect(canvas).toHaveClass(/is-ready/, { timeout: 15_000 });
  await expect(art).toHaveCSS('opacity', '0');
});
