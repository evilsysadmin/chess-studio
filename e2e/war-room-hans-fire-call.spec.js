import { expect, test } from '@playwright/test';
import { buttonWithVisibleText, login, mockApi } from './helpers.js';
import { warRoomHansEventForGame } from '../frontend/src/components/WarRoomHansEventContract.js';
import { WAR_ROOM_HANS_COMPLETED_GAMES_KEY } from '../frontend/src/components/WarRoomHansPerGame.js';

const WAR_ROOM_READY_TIMEOUT = 45_000;
const HANS_BOARD_PEEK_TIMEOUT = 90_000;
const HANS_DIALOGUE_STEP_TIMEOUT = 20_000;

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

async function openFireGame(page) {
  await page.setViewportSize({ width: 1440, height: 960 });
  await mockApi(page);
  await login(page);
  await seedGamesBeforeFire(page);
  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();

  await expect(page.locator('.board-live-row.is-3d-warroom')).toBeVisible({ timeout: WAR_ROOM_READY_TIMEOUT });
  const canvas = page.locator('.board3d-main-canvas');
  await expect(canvas).toBeVisible({ timeout: WAR_ROOM_READY_TIMEOUT });
  return canvas;
}

async function hansGameId(page) {
  return page.locator('[data-war-room-hans-game-id]').first().getAttribute('data-war-room-hans-game-id');
}

async function persistedHansCompletion(page, gameId) {
  return page.evaluate(({ key, id }) => {
    try {
      const stored = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(stored) && stored.includes(id);
    } catch {
      return false;
    }
  }, { key: WAR_ROOM_HANS_COMPLETED_GAMES_KEY, id: gameId });
}

test('War Room · el número del fuego completa cotilleo, corte de Matthias y respuesta de Hans', async ({ page }) => {
  // The dedicated CI lane uses SwiftShader. Hans' choreography advances from
  // rendered frames and intentionally caps late-frame deltas, so a software
  // renderer can take roughly twice wall-clock time without production being
  // stuck. Keep the normal readiness budget, but allow the long board-side
  // choreography enough time to reach its semantic leave-bypass route.
  test.setTimeout(180_000);

  const canvas = await openFireGame(page);
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
  // The reply itself is intentionally short, so assert the persistent runtime
  // acknowledgement written only after Hans is physically onscreen and anchored.
  await expect(canvas).toHaveAttribute('data-war-room-hans-reply-seen', 'true', { timeout: WAR_ROOM_READY_TIMEOUT });
  await expect(canvas).toHaveAttribute('data-war-room-hans-first-screen', /^(edge|onscreen)$/);
  await expect(matthiasCall).toBeHidden();

  // Regression guard: geometry clearance is allowed to clamp Hans' rendered X,
  // but entering the semantic exit-bypass route must still freeze him for the
  // complete board-side exchange instead of letting him walk straight out.
  // These dialogue bubbles are intentionally short-lived. Match their text as
  // part of the locator so visibility + copy are observed atomically instead of
  // racing two sequential assertions against a transient DOM node on SwiftShader.
  const peek = page
    .getByRole('status', { name: 'Hans cotillea el tablero y propone una jugada' })
    .filter({ hasText: 'Yo probaría' });
  await expect(peek).toBeVisible({ timeout: HANS_BOARD_PEEK_TIMEOUT });

  const matthiasWorking = page
    .getByRole('status', { name: 'Matthias manda a Hans volver al trabajo' })
    .filter({ hasText: 'Hans, bitte. Estamos trabajando.' });
  await expect(matthiasWorking).toBeVisible({ timeout: HANS_DIALOGUE_STEP_TIMEOUT });

  const hansReply = page
    .getByRole('status', { name: 'Hans obedece a Matthias' })
    .filter({ hasText: 'Claro, señor.' });
  await expect(hansReply).toBeVisible({ timeout: HANS_DIALOGUE_STEP_TIMEOUT });
});

test('War Room · F5 con Hans ya visible no completa ni silencia el número', async ({ page }) => {
  test.setTimeout(120_000);

  const canvas = await openFireGame(page);
  const matthiasCall = page.getByRole('status', { name: 'Matthias llama a Hans por el fuego' });
  await expect(matthiasCall).toBeVisible({ timeout: WAR_ROOM_READY_TIMEOUT });
  await expect(canvas).toHaveAttribute('data-war-room-hans-call-released', 'true', { timeout: 8_000 });
  await expect(canvas).toHaveAttribute('data-war-room-hans-reply-seen', 'true', { timeout: WAR_ROOM_READY_TIMEOUT });

  const gameId = await hansGameId(page);
  expect(gameId).toBeTruthy();
  expect(await persistedHansCompletion(page, gameId)).toBe(false);

  await page.reload();
  await expect(page.locator('.board-live-row.is-3d-warroom')).toBeVisible({ timeout: WAR_ROOM_READY_TIMEOUT });
  await expect(page.locator('.board3d-main-canvas')).toBeVisible({ timeout: WAR_ROOM_READY_TIMEOUT });
  await expect(matthiasCall).toBeVisible({ timeout: WAR_ROOM_READY_TIMEOUT });
  await expect(matthiasCall).toContainText('HANS! El fuego, bitte.');
  expect(await hansGameId(page)).toBe(gameId);
  expect(await persistedHansCompletion(page, gameId)).toBe(false);
});
