import { expect, test } from '@playwright/test';
import { login, mockApi, openMoreGameModes } from './helpers.js';

const RELEASE = '0123456789abcdef';
const INDEX_URL = `https://assets.chess-studio.shadowops.dpdns.org/chess-football-godot/releases/${RELEASE}/index.html`;

async function openExperiments(page) {
  await mockApi(page, {
    profileSeed: {
      'matthias.onboarded': '2',
      'chess-study-home-guide-dismissed-v1': '1',
    },
  });
  await page.route('**/chess-football-godot/current.json**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      version: 1,
      release: RELEASE,
      sourceSha: 'a'.repeat(40),
      index: INDEX_URL,
    }),
  }));
  await page.route(INDEX_URL, (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><body><main>Chess Football mock runtime</main></body></html>',
  }));

  await login(page);
  await openMoreGameModes(page);
  const tools = page.locator('#illustrated-home-tools');
  await tools.getByRole('button').filter({ hasText: 'Experimentos geniales' }).click();
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
}

test('Chess Football fills the viewport and returns only through the runtime exit', async ({ page }) => {
  await openExperiments(page);
  await page.setViewportSize({ width: 1280, height: 720 });

  await page.locator('.lab-workshop-portal--football').click();

  const host = page.locator('.chess-football-godot-host');
  await expect(host).toBeVisible();
  const frame = page.locator('iframe[title="Chess Football Godot"]');
  await expect(frame).toBeVisible();
  await expect(frame).toHaveAttribute('src', INDEX_URL);
  await expect(host).toHaveAttribute('data-runtime-ready', 'true');
  await expect(page.locator('.chess-football-godot-host__status')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Volver a Experimentos' })).toHaveCount(0);

  const box = await host.boundingBox();
  expect(box).not.toBeNull();
  expect(box.left).toBeLessThanOrEqual(1);
  expect(box.top).toBeLessThanOrEqual(1);
  expect(box.width).toBeGreaterThanOrEqual(1278);
  expect(box.height).toBeGreaterThanOrEqual(718);
  expect(await page.evaluate(() => document.fullscreenElement === null)).toBe(true);

  // React must not interpret Escape as "volver": while Football owns the mode,
  // Escape belongs to Godot's pause menu.
  await page.keyboard.press('Escape');
  await expect(host).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toHaveCount(0);

  await frame.contentFrame().locator('body').evaluate(() => {
    window.parent.postMessage({ source: 'chess-football-godot', type: 'exit' }, '*');
  });
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
  await expect(host).toHaveCount(0);
});


test('Chess Football requests landscape immersion from the launch gesture and releases it on exit', async ({ page }) => {
  await page.addInitScript(() => {
    window.__footballFullscreenRequests = 0;
    window.__footballLandscapeLocks = 0;
    window.__footballOrientationUnlocks = 0;
    window.__footballOrientationStubbed = false;

    const nativeMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query) => {
      if (query !== '(pointer: coarse)') return nativeMatchMedia(query);
      return {
        matches: true,
        media: query,
        onchange: null,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() { return true; },
      };
    };

    Element.prototype.requestFullscreen = function requestFullscreen() {
      window.__footballFullscreenRequests += 1;
      return Promise.resolve();
    };

    try {
      Object.defineProperty(Screen.prototype, 'orientation', {
        configurable: true,
        get() {
          return {
            lock(mode) {
              if (mode === 'landscape') window.__footballLandscapeLocks += 1;
              return Promise.resolve();
            },
            unlock() {
              window.__footballOrientationUnlocks += 1;
            },
          };
        },
      });
      window.__footballOrientationStubbed = true;
    } catch {
      // The runtime contract is still covered by fullscreen + immersive marker
      // on engines where Screen.prototype.orientation cannot be redefined.
    }
  });

  await openExperiments(page);
  await page.locator('.lab-workshop-portal--football').click();

  const host = page.locator('.chess-football-godot-host');
  await expect(host).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__footballFullscreenRequests)).toBe(1);
  await expect(page.locator('html')).toHaveAttribute('data-chess-football-immersive', 'requested');

  const orientationWasStubbed = await page.evaluate(() => window.__footballOrientationStubbed === true);
  if (orientationWasStubbed) {
    await expect.poll(() => page.evaluate(() => window.__footballLandscapeLocks)).toBe(1);
  }

  const frame = page.locator('iframe[title="Chess Football Godot"]');
  await frame.contentFrame().locator('body').evaluate(() => {
    window.parent.postMessage({ source: 'chess-football-godot', type: 'exit' }, '*');
  });

  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-chess-football-immersive', 'requested');
  if (orientationWasStubbed) {
    await expect.poll(() => page.evaluate(() => window.__footballOrientationUnlocks)).toBe(1);
  }
});
