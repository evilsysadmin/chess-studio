import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function startingMatch({ youReady = false } = {}) {
  return {
    id: 'pvp-recover-1',
    white: 'e2e',
    black: 'bob',
    whiteRating: 400,
    blackRating: 416,
    fen: START_FEN,
    turn: 'w',
    status: 'starting',
    result: null,
    endReason: null,
    startsAt: null,
    youReady,
    opponentReady: false,
    ratingChange: null,
    clock: {
      id: '10+0',
      whiteMs: 600000,
      blackMs: 600000,
      incrementMs: 0,
      runningColor: null,
    },
    history: [],
    revision: youReady ? 1 : 0,
    youAre: 'w',
    yourTurn: false,
    createdAt: '2026-09-18T10:00:00Z',
    updatedAt: '2026-09-18T10:00:00Z',
  };
}

test('PvP premium · F5 durante el handoff recupera el duelo y reintenta ready de forma segura', async ({ page }) => {
  await mockApi(page);
  let readyCalls = 0;

  await page.route('**/api/pvp/lobby', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      roster: [
        { username: 'e2e', isSelf: true, rating: 400, tier: 'Principiante' },
        { username: 'bob', isSelf: false, rating: 416, tier: 'Principiante' },
      ],
      challenges: [],
      activeMatch: startingMatch({ youReady: readyCalls > 0 }),
      pollAfterMs: 3000,
    }),
  }));

  await page.route('**/api/pvp/matches/pvp-recover-1/ready', (route) => {
    readyCalls += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ match: startingMatch({ youReady: true }) }),
    });
  });

  await page.route('**/api/pvp/matches/pvp-recover-1', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ match: startingMatch({ youReady: true }), pollAfterMs: 1250 }),
  }));

  await login(page);
  await page.evaluate(() => {
    sessionStorage.setItem(
      'chess-study-pvp-enrollment-v1',
      JSON.stringify({ username: 'e2e', enrolled: true }),
    );
  });

  await page.reload();

  const handoff = page.getByRole('dialog', { name: 'Entrando en 1 contra 1' });
  await expect(handoff).toBeVisible();
  await expect(handoff).toContainText('bob');
  await expect.poll(() => readyCalls).toBeGreaterThanOrEqual(1);

  const callsBeforeReload = readyCalls;
  await page.reload();

  await expect(handoff).toBeVisible();
  await expect(handoff).toContainText('bob');
  await expect.poll(() => readyCalls).toBeGreaterThan(callsBeforeReload);
});
