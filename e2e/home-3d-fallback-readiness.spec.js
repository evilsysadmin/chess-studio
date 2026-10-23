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

test('Home Blender no muestra el fallback mientras espera su primer frame', async ({ page }) => {
  // Software WebGL may need much longer than the default functional E2E budget.
  test.setTimeout(135_000);
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
  const loadingCover = page.locator('.route-loading.home-3d-loading');

  await expect(loadingCover).toBeVisible();
  await expect(loadingCover).toContainText('LOADING');
  await expect(canvas).toHaveCount(1);
  await expect.poll(() => art.evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
  await page.waitForTimeout(150);

  // The GLB may already be downloaded, but no WebGL frame has been allowed
  // through. Eligible Blender devices must stay on the intentional dark loading
  // surface instead of flashing the legacy hall before the real room appears.
  await expect(canvas).not.toHaveClass(/is-ready/);
  await expect(canvas).toHaveAttribute('data-home-castle-compositor', 'blender-runtime');
  await expect(canvas).toHaveAttribute('data-home-blender-runtime', 'loading');
  await expect(art).toHaveCSS('opacity', '0');

  await page.evaluate(() => window.__homeFrameGate.release());
  try {
    // A mounted canvas is not a completed Blender frame, and the 2D fallback
    // must not be accepted as success if software Chromium is slow.
    await expect(canvas).toHaveClass(/is-ready/, { timeout: 75_000 });
    await expect(canvas).toHaveAttribute('data-home-blender-runtime', 'ready');
    await expect(canvas).toBeVisible();
    await expect(loadingCover).toHaveCount(0, { timeout: 15_000 });
    // is-ready is only published after a real WebGL frame has composed.
    // Do not add a separate locator.evaluate() probe here: under hosted
    // SwiftShader it may time out on Playwright's 12 s actionability budget
    // even after canvas is genuinely ready. The failure diagnostics below
    // already capture canvas pixel dimensions if any readiness gate fails.
    await expect(art).toHaveCSS('opacity', '0');
  } catch (error) {
    const state = await page.evaluate(() => {
      const node = document.querySelector('canvas.illustrated-home__castle-3d');
      return {
        canvasPresent: Boolean(node),
        ready: node?.classList.contains('is-ready') ?? false,
        runtime: node?.dataset.homeBlenderRuntime ?? null,
        compositor: node?.dataset.homeCastleCompositor ?? null,
        canvasPixels: node ? node.width * node.height : null,
        loadingCoverPresent: Boolean(document.querySelector('.home-3d-loading')),
        artOpacity: getComputedStyle(document.querySelector('.illustrated-home__art') || document.body).opacity,
      };
    }).catch(() => ({ diagnostics: 'unavailable' }));
    throw new Error('Home frame readiness or fallback contract failed: '
      + JSON.stringify(state) + '; ' + String(error?.message || error));
  }

  // The global RetroPlayer belongs to the shell, not Home's 3D stage.
  // Interact with the real control after WebGL is visible: a fullscreen
  // overlay or canvas intercepting its hitbox must fail Playwright click.
  const dock = page.locator('.global-music-dock');
  const openPlayer = page.getByRole('button', { name: 'Abrir reproductor de música', exact: true });
  await expect(dock).toBeVisible();
  await expect(openPlayer).toBeVisible();
  await openPlayer.click();
  await expect(dock.locator('.music-deck-expanded')).toBeVisible();
  const foldPlayer = page.getByRole('button', { name: 'Plegar reproductor de música', exact: true });
  await foldPlayer.click();
  await expect(dock.locator('.music-deck-collapsed')).toBeVisible();
});
