import { expect, test } from '@playwright/test';
import { login, mockApi, openMoreGameModes } from './helpers.js';

const ORIGIN = 'https://assets.chess-studio.shadowops.dpdns.org';
const A = '1111111111111111';
const B = '2222222222222222';

test.use({ reducedMotion: 'reduce' });

async function openExperiments(page) {
  await mockApi(page, {
    profileSeed: {
      'matthias.onboarded': '2',
      'chess-study-home-guide-dismissed-v1': '1',
    },
  });
  await login(page);
  const more = await openMoreGameModes(page);
  const portal = more.getByRole('button').filter({ hasText: 'Experimentos geniales' });
  await expect(portal).toBeVisible();
  await portal.click();
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
}

function godotExport(mode, release) {
  return `${ORIGIN}/${mode}/releases/${release}/index.html`;
}

async function flipReleaseAndCheckLiveIframe(page, frame, getRelease, setRelease) {
  const oldSrc = await frame.getAttribute('src');
  expect(oldSrc).toContain(`/releases/${A}/index.html`);
  const oldFrameHandle = await frame.elementHandle();
  expect(oldFrameHandle).not.toBeNull();

  setRelease(B);
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  // A new current.json may be published while this iframe is already
  // running. The active session owns its own content-addressed release.
  await page.waitForTimeout(300);
  await expect(frame).toHaveAttribute('src', oldSrc);
  expect(await frame.elementHandle()).not.toBeNull();
  expect(getRelease()).toBe(B);
  return oldFrameHandle;
}

test('Pawn Slug · A stays mounted while CDN current moves to B; next session picks B', async ({ page }) => {
  let release = A;
  await page.route('**/pawn-slug-godot/current.json**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      version: 1,
      release,
      sourceSha: 'a'.repeat(40),
      index: godotExport('pawn-slug-godot', release),
    }),
  }));
  await page.route('**/pawn-slug-godot/releases/*/index.html**', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><body><main>Pawn Slug mock release</main><script>window.parent.postMessage({source:"pawn-slug-godot",type:"ready"},"*")</script></body></html>',
  }));

  await openExperiments(page);
  const portal = page.getByRole('button', { name: /PAWN SLUG GODOT/i });
  await expect(portal).toBeVisible();
  await portal.click();
  const frame = page.locator('iframe[title="Pawn Slug Godot"]');
  await expect(frame).toBeVisible();
  await expect(page.locator('.pawn-slug-godot-host')).toHaveAttribute('data-runtime-ready', 'true');
  await flipReleaseAndCheckLiveIframe(page, frame, () => release, (value) => { release = value; });

  await frame.contentFrame().locator('body').evaluate(() => {
    window.parent.postMessage({ source: 'pawn-slug-godot', type: 'exit' }, '*');
  });
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
  await portal.click();
  await expect(frame).toBeVisible();
  await expect(frame).toHaveAttribute('src', new RegExp(`/releases/${B}/index\\.html\\?stage=`));
  await expect(page.locator('.pawn-slug-godot-host')).toHaveAttribute('data-runtime-ready', 'true');
});

test('Chess Football · A stays mounted while CDN current moves to B; next match picks B', async ({ page }) => {
  let release = A;
  await page.route('**/chess-football-godot/current.json**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      version: 1,
      release,
      sourceSha: 'b'.repeat(40),
      index: godotExport('chess-football-godot', release),
    }),
  }));
  await page.route('**/chess-football-godot/releases/*/index.html**', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><body><main>Football mock release</main><script>window.parent.postMessage({source:"chess-football-godot",type:"ready"},"*")</script></body></html>',
  }));

  await openExperiments(page);
  await page.locator('.lab-workshop-portal--football').click();
  await expect(page.getByRole('heading', { name: 'Chess Football' })).toBeVisible();
  const start = page.locator('.chess-football-entry__choice--quick');
  await start.click();
  const frame = page.locator('iframe[title="Chess Football Godot"]');
  await expect(frame).toHaveAttribute('src', godotExport('chess-football-godot', A));
  await expect(page.locator('.chess-football-godot-host')).toHaveAttribute('data-runtime-ready', 'true');
  await flipReleaseAndCheckLiveIframe(page, frame, () => release, (value) => { release = value; });

  await frame.contentFrame().locator('body').evaluate(() => {
    window.parent.postMessage({ source: 'chess-football-godot', type: 'exit' }, '*');
  });
  await expect(page.locator('.chess-football-godot-host')).toHaveCount(0);
  await start.click();
  await expect(frame).toHaveAttribute('src', godotExport('chess-football-godot', B));
  await expect(page.locator('.chess-football-godot-host')).toHaveAttribute('data-runtime-ready', 'true');
});
