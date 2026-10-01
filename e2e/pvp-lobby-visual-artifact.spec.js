import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { login, mockApi } from './helpers.js';

const ARTIFACT_DIR = '../.artifacts/app-visual/pvp-lobby';

async function openPvpLobby(page, viewport) {
  await page.setViewportSize(viewport);
  await mockApi(page, {
    profileSeed: {
      'matthias.onboarded': '2',
      'chess-study-home-guide-dismissed-v1': '1',
    },
  });

  await page.route('**/api/pvp/lobby', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      roster: [
        { username: 'evilsysadmin', isSelf: true, rating: 400, tier: 'Principiante' },
        {
          username: 'sparringmeister',
          isSelf: false,
          rating: 400,
          tier: 'Principiante',
          headToHead: { games: 3, wins: 2, draws: 0, losses: 1 },
        },
        {
          username: 'bob',
          isSelf: false,
          rating: 512,
          tier: 'Principiante',
          headToHead: { games: 4, wins: 1, draws: 1, losses: 2 },
        },
      ],
      challenges: [{
        id: 'visual-incoming',
        challenger: 'alice',
        opponent: 'evilsysadmin',
        challengerRating: 430,
        opponentRating: 400,
        status: 'pending',
        direction: 'incoming',
        createdAt: '2099-01-01T10:00:00Z',
        expiresAt: '2099-01-01T10:01:15Z',
      }],
      activeMatch: null,
      messages: [{
        id: 'visual-message',
        username: 'bob',
        text: '¿Duelo?',
        createdAt: new Date().toISOString(),
        isSelf: false,
      }],
      pollAfterMs: 3000,
    }),
  }));

  await login(page);

  let entry = page.getByRole('button', { name: 'Abrir Sala de Duelos 1 contra 1' });
  if (await entry.count() === 0) {
    const more = page.getByRole('button', { name: /Más formas de jugar/ });
    if ((await more.getAttribute('aria-expanded')) !== 'true') await more.click();
    entry = page.getByRole('button', { name: 'Abrir Sala de Duelos 1 contra 1' });
  }
  await expect(entry).toBeVisible();
  await entry.click();

  const lobby = page.getByRole('dialog', { name: 'Duelo 1 contra 1 · War Room' });
  await expect(lobby).toBeVisible();
  await expect(lobby.getByRole('region', { name: 'Retos entrantes' })).toBeVisible();
  await expect(lobby.getByRole('heading', { name: '¿A quién retas?' })).toBeVisible();
  await expect(lobby.locator('details.pvp-lobby__panel--chat')).not.toHaveAttribute('open', '');

  const horizontalOverflow = await page.evaluate(() => (
    document.documentElement.scrollWidth - document.documentElement.clientWidth
  ));
  expect(horizontalOverflow).toBeLessThanOrEqual(1);

  await page.addStyleTag({
    content: '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }',
  });
  await page.waitForTimeout(120);
  return lobby;
}

test('PvP lobby · visual desktop 1440x900', async ({ page }) => {
  test.setTimeout(45_000);
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const lobby = await openPvpLobby(page, { width: 1440, height: 900 });

  const [incoming, roster] = await Promise.all([
    lobby.getByRole('region', { name: 'Retos entrantes' }).boundingBox(),
    lobby.getByRole('heading', { name: '¿A quién retas?' }).boundingBox(),
  ]);
  expect(incoming).not.toBeNull();
  expect(roster).not.toBeNull();
  expect(incoming.y).toBeLessThan(roster.y);

  await page.screenshot({
    path: ARTIFACT_DIR + '/pvp-lobby-desktop-1440x900.png',
    animations: 'disabled',
  });
});

test.describe('PvP lobby · mobile touch', () => {
  test.use({ hasTouch: true, isMobile: true });

  test('visual Android 390x844', async ({ page }) => {
    test.setTimeout(45_000);
    await mkdir(ARTIFACT_DIR, { recursive: true });
    const lobby = await openPvpLobby(page, { width: 390, height: 844 });

    const targets = lobby.locator('button:visible, summary:visible');
    for (let i = 0; i < await targets.count(); i += 1) {
      const box = await targets.nth(i).boundingBox();
      if (!box) continue;
      expect(Math.min(box.width, box.height), 'mobile lobby target must be >=44px').toBeGreaterThanOrEqual(44);
    }

    await page.screenshot({
      path: ARTIFACT_DIR + '/pvp-lobby-android-390x844.png',
      animations: 'disabled',
    });
  });
});
