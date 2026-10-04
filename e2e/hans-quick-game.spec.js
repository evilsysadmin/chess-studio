import { expect, test } from '@playwright/test';
import { login, mockApi, startQuickGame } from './helpers.js';
import { warRoomHansEventForGame } from '../frontend/src/components/WarRoomHansEventContract.js';

test('Partida rápida 3D hace visible a Hans también fuera del evento fuego', async ({ page }) => {
  // The default mocked quick match is deliberately NOT the fireplace event.
  // This protects the real ambient scheduler path that regressed while the
  // dedicated fire canary stayed green.
  expect(warRoomHansEventForGame('e2e-game-1')).toBe('water-plant');

  await page.addInitScript(() => {
    globalThis.__CHESS_E2E_HANS_AMBIENT_AUDIT__ = true;
  });
  await mockApi(page, {
    profileSeed: {
      'chess-study-mechanic-tutorial-progress-v1': JSON.stringify({
        'war-room-basics': { seen: true },
      }),
      'matthias.onboarded': '2',
      'chess-study-home-guide-dismissed-v1': '1',
    },
  });
  await login(page);
  await startQuickGame(page);

  await expect(page.locator('[data-board3d-war-room="true"]')).toBeVisible({ timeout: 30_000 });

  const marker = page.locator('[data-war-room-hans-game-id="e2e-game-1"]').first();
  await expect(marker).toHaveAttribute('data-war-room-hans-quick-request', 'false');

  const canvas = page.locator('.board3d-main-canvas');
  await expect(canvas).toBeVisible({ timeout: 30_000 });

  await expect(page.getByRole('region', { name: 'Tutorial de War Room con Matthias' })).toHaveCount(0);

  // water-plant starts after a deterministic 6–14 s delay for a recurrent
  // player. The routine can finish before Playwright's first poll on fast CI,
  // so assert the sticky fact recorded at the exact frame Hans becomes visible.
  await expect.poll(
    () => page.evaluate(() => {
      const node = document.querySelector('.board3d-main-canvas');
      if (!node) return 'missing';
      return [
        node.dataset.warRoomHansServiceSeenVisible || 'false',
        node.dataset.warRoomHansServiceEvent || 'event-missing',
        node.dataset.warRoomHansServiceStatus || 'status-missing',
      ].join('|');
    }),
    { timeout: 30_000, intervals: [100, 200, 300, 500, 1000] },
  ).toMatch(/^true\|water-plant\|/);

  await expect(marker).toHaveAttribute('data-war-room-hans-runtime', 'visible');
});
