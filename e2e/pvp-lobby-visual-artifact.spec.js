import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { login, mockApi } from './helpers.js';

const ARTIFACT_DIR = '../.artifacts/app-visual/pvp-lobby';

function lobbyPayload() {
  return {
    roster: [
      { username: 'e2e', rating: 1050, tier: 'Intermedio', isSelf: true },
      { username: 'bob', rating: 1210, tier: 'Intermedio', isSelf: false },
      { username: 'anna', rating: 980, tier: 'Intermedio', isSelf: false },
    ],
    challenges: [{
      id: 'challenge-visual-1',
      challenger: 'bob',
      opponent: 'e2e',
      challengerRating: 1210,
      opponentRating: 1050,
      status: 'pending',
      direction: 'incoming',
      expiresAt: '2099-01-01T10:05:00Z',
    }],
    activeMatch: null,
    messages: [
      { id: 'm1', username: 'anna', text: '¿Alguien para una?', createdAt: '2099-01-01T10:00:00Z' },
      { id: 'm2', username: 'bob', text: 'Te he retado.', createdAt: '2099-01-01T10:00:05Z' },
    ],
    pollAfterMs: 3000,
  };
}

async function openLobby(page) {
  await mockApi(page);
  await page.route('**/api/pvp/lobby', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(lobbyPayload()),
  }));
  await login(page);

  const canonical = page.getByRole('button', { name: 'Abrir Sala de Duelos 1 contra 1' });
  if (await canonical.isVisible().catch(() => false)) {
    await canonical.click();
  } else {
    const more = page.getByRole('button', { name: /Más formas de jugar/ });
    if ((await more.getAttribute('aria-expanded')) !== 'true') await more.click();
    await page.getByRole('button', { name: 'Abrir rivales 1 contra 1 de War Room' }).click();
  }

  const lobby = page.getByRole('dialog', { name: 'Duelo 1 contra 1 · War Room' });
  await expect(lobby).toBeVisible();
  await expect(lobby.getByRole('heading', { name: 'Sala de Duelos' })).toBeVisible();
  await expect(lobby.locator('.pvp-duel-hall__architecture')).toHaveCount(1);
  await expect(lobby.locator('.pvp-lobby__header-status')).toHaveCount(0);
  return lobby;
}

async function assertPriorityHierarchy(lobby, { stacked = false } = {}) {
  const challenges = lobby.locator('.pvp-lobby__panel--challenges');
  const roster = lobby.locator('.pvp-lobby__panel--roster');
  await expect(challenges).toBeVisible();
  await expect(roster).toBeVisible();
  const [challengeBox, rosterBox] = await Promise.all([challenges.boundingBox(), roster.boundingBox()]);
  expect(challengeBox).not.toBeNull();
  expect(rosterBox).not.toBeNull();
  if (stacked) {
    expect(challengeBox.y + challengeBox.height).toBeLessThanOrEqual(rosterBox.y + 2);
  } else {
    expect(challengeBox.y).toBeLessThanOrEqual(rosterBox.y + 4);
  }

  const chat = lobby.locator('.pvp-lobby__chat-disclosure');
  await expect(chat).not.toHaveAttribute('open', '');
  await expect(chat.getByText('Conversación', { exact: true })).toBeVisible();
}

test('PvP lobby · desktop prioritizes challenges over rivals', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const lobby = await openLobby(page);
  await assertPriorityHierarchy(lobby);

  const roomBox = await lobby.boundingBox();
  expect(roomBox, 'desktop Duel Hall must have a measurable room shell').not.toBeNull();
  expect(roomBox.width / 1440, 'desktop lobby fills the castle room horizontally').toBeGreaterThan(0.9);
  expect(roomBox.height / 900, 'desktop lobby fills the castle room vertically').toBeGreaterThan(0.9);

  const roster = lobby.locator('.pvp-lobby__panel--roster');
  const side = lobby.locator('.pvp-lobby__side');
  const [rosterBox, sideBox] = await Promise.all([roster.boundingBox(), side.boundingBox()]);
  expect(rosterBox).not.toBeNull();
  expect(sideBox).not.toBeNull();
  expect(rosterBox.x + rosterBox.width).toBeLessThanOrEqual(sideBox.x + 4);

  await mkdir(ARTIFACT_DIR, { recursive: true });
  await page.screenshot({
    path: ARTIFACT_DIR + '/pvp-lobby-desktop-1440x900.png',
    animations: 'disabled',
  });
});

test.use({ hasTouch: true, isMobile: true });

test('PvP lobby · Android keeps the command hierarchy touchable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const lobby = await openLobby(page);
  await assertPriorityHierarchy(lobby, { stacked: true });

  const targets = lobby.locator('button:visible, summary:visible');
  const targetCount = await targets.count();
  for (let index = 0; index < targetCount; index += 1) {
    const box = await targets.nth(index).boundingBox();
    if (!box) continue;
    expect(Math.min(box.width, box.height), 'mobile lobby target must be >=44px').toBeGreaterThanOrEqual(44);
  }

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  await mkdir(ARTIFACT_DIR, { recursive: true });
  await page.screenshot({
    path: ARTIFACT_DIR + '/pvp-lobby-android-390x844.png',
    animations: 'disabled',
  });
});
