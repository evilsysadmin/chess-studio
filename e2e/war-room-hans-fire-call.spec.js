import { expect, test } from '@playwright/test';
import { buttonWithVisibleText, login, mockApi } from './helpers.js';
import { warRoomHansEventForGame } from '../frontend/src/components/WarRoomHansEventContract.js';

const WAR_ROOM_READY_TIMEOUT = 45_000;

function firstE2EFireGameIndex() {
  for (let index = 1; index <= 64; index += 1) {
    if (warRoomHansEventForGame(`e2e-game-${index}`) === 'fire') return index;
  }
  throw new Error('Hans fire-call E2E could not find a deterministic fire game id');
}

async function seedGamesBeforeFire(page) {
  const fireIndex = firstE2EFireGameIndex();
  if (fireIndex <= 1) return;
  await page.evaluate(async (count) => {
    for (let index = 1; index < count; index += 1) {
      await fetch('http://localhost:4000/api/games', {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body: '{}',
      });
    }
  }, fireIndex);
}

test('War Room · Matthias llama a Hans por el fuego y Hans responde al aparecer', async ({ page }) => {
  test.setTimeout(90_000);

  await page.setViewportSize({ width: 1440, height: 960 });
  await mockApi(page);
  await login(page);
  // Hans now has one deterministic ambient event per game. Seed the mock game's
  // counter so this dedicated lane actually exercises the fire event rather than
  // whichever chore e2e-game-1 happens to hash to.
  await seedGamesBeforeFire(page);
  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();

  await expect(page.locator('.board-live-row.is-3d-warroom')).toBeVisible({ timeout: WAR_ROOM_READY_TIMEOUT });
  const canvas = page.locator('.board3d-main-canvas');
  await expect(canvas).toBeVisible({ timeout: WAR_ROOM_READY_TIMEOUT });

  const matthiasCall = page.getByRole('status', { name: 'Matthias llama a Hans por el fuego' });
  await expect(matthiasCall).toBeVisible({ timeout: WAR_ROOM_READY_TIMEOUT });
  // The call is intentionally brief. Assert its own contract immediately: a
  // cold 3D mount can replace the canvas while the scene reaches its ready
  // frame, and waiting on that new canvas must not consume the whole bubble.
  await expect(matthiasCall).toContainText('MATTHIAS');
  await expect(matthiasCall).toContainText('HANS! El fuego, bitte.');
  await expect(matthiasCall).toHaveAttribute('data-matthias-square', /^[a-h][1-8]$/);
  await expect(canvas).toHaveAttribute('data-war-room-hans-scene-ready', 'true');
  await expect(canvas).toHaveAttribute('data-war-room-hans-screen', 'hidden');

  await expect(page.getByRole('status', { name: 'Bravuconada de Matthias al iniciar la partida' })).toHaveCount(0);

  await expect(canvas).toHaveAttribute('data-war-room-hans-call-released', 'true', { timeout: 8_000 });
  // Start waiting for the short reply immediately after release. Waiting for a
  // separate screen-state roundtrip first can consume its whole 1.35 s lifetime
  // on software WebGL even though Hans rendered correctly.
  const hansReply = page.locator('.warroom-fire-call-bubble-hans:visible');
  await expect(hansReply).toHaveText(/HANS\s*Sí, señor\./, { timeout: 20_000 });
  await expect(canvas).toHaveAttribute('data-war-room-hans-screen', 'onscreen');
  await expect(matthiasCall).toBeHidden();
});