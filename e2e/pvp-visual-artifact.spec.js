import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { login, mockApi } from './helpers.js';

const ARTIFACT_DIR = '../.artifacts/app-visual';
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const CAPTURES = [
  { label: 'desktop-1440x900', width: 1440, height: 900, hasTouch: false },
  { label: 'android-390x844', width: 390, height: 844, hasTouch: true },
];

function startingMatch() {
  return {
    id: 'pvp-visual-1',
    white: 'e2e',
    black: 'bob',
    whiteRating: 400,
    blackRating: 416,
    fen: START_FEN,
    turn: 'w',
    status: 'starting',
    result: null,
    history: [],
    revision: 0,
    youAre: 'w',
    yourTurn: false,
    youReady: false,
    opponentReady: false,
    startsAt: null,
    endReason: null,
    clock: { id: '10+0', whiteMs: 600000, blackMs: 600000, incrementMs: 0, runningColor: null },
    createdAt: '2026-09-28T12:00:00Z',
    updatedAt: '2026-09-28T12:00:00Z',
  };
}

async function openPlayMenu(page) {
  const more = page.getByRole('button', { name: /Más formas de jugar/ });
  if (await more.count()) {
    if ((await more.getAttribute('aria-expanded')) !== 'true') await more.click();
  }
}

test('PvP · lobby + handoff canonical desktop/mobile', async ({ browser }) => {
  test.setTimeout(60_000);
  await mkdir(ARTIFACT_DIR, { recursive: true });

  for (const capture of CAPTURES) {
    const context = await browser.newContext({
      viewport: { width: capture.width, height: capture.height },
      hasTouch: capture.hasTouch,
      isMobile: false,
    });
    const page = await context.newPage();

    await mockApi(page, {
      profileSeed: {
        'matthias.onboarded': '2',
        'chess-study-home-guide-dismissed-v1': '1',
      },
    });

    const challenge = {
      id: 'pvp-visual-challenge',
      challenger: 'bob',
      opponent: 'e2e',
      challengerRating: 416,
      opponentRating: 400,
      status: 'pending',
      direction: 'incoming',
      expiresAt: '2026-09-28T12:10:00Z',
    };

    await page.route('**/api/pvp/lobby', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        roster: [
          { username: 'e2e', rating: 400, tier: 'Principiante', isSelf: true },
          { username: 'bob', rating: 416, tier: 'Principiante', isSelf: false },
        ],
        challenges: [challenge],
        activeMatch: null,
        pollAfterMs: 3000,
      }),
    }));
    await page.route('**/api/pvp/roster', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ member: { username: 'e2e', rating: 400, tier: 'Principiante', isSelf: true } }),
    }));
    await page.route('**/api/pvp/challenges/pvp-visual-challenge/accept', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ match: startingMatch() }),
    }));
    await page.route('**/api/pvp/matches/pvp-visual-1/ready', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ match: { ...startingMatch(), youReady: true, revision: 1 } }),
    }));
    await page.route('**/api/pvp/matches/pvp-visual-1', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ match: { ...startingMatch(), youReady: true, revision: 1 } }),
    }));

    await login(page);
    await openPlayMenu(page);
    const rosterEntry = page.getByRole('button', { name: 'Abrir rivales 1 contra 1 de War Room' });
    await expect(rosterEntry).toBeVisible();
    await rosterEntry.click();

    const lobby = page.getByRole('dialog', { name: 'Duelo 1 contra 1 · War Room' });
    await expect(lobby).toBeVisible();
    await expect(lobby.getByText('bob', { exact: true }).first()).toBeVisible();
    await page.screenshot({
      path: `${ARTIFACT_DIR}/pvp-lobby-${capture.label}.png`,
      fullPage: false,
      animations: 'disabled',
    });

    await lobby.getByRole('button', { name: 'Aceptar', exact: true }).click();
    const handoff = page.getByRole('dialog', { name: 'Entrando en 1 contra 1' });
    await expect(handoff).toBeVisible();
    await expect(handoff.getByText('Sincronizando el duelo…', { exact: true })).toBeVisible();
    await page.screenshot({
      path: `${ARTIFACT_DIR}/pvp-handoff-${capture.label}.png`,
      fullPage: false,
      animations: 'disabled',
    });

    await context.close();
  }
});
