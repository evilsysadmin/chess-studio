import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { login, mockApi } from './helpers.js';

const ARTIFACT_DIR = '../.artifacts/app-visual/pvp-handoff';
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function startingMatch() {
  return {
    id: 'pvp-handoff-visual-1',
    white: 'e2e',
    black: 'bob',
    whiteRating: 1050,
    blackRating: 1210,
    fen: START_FEN,
    turn: 'w',
    status: 'starting',
    result: null,
    history: [],
    revision: 0,
    youAre: 'w',
    yourTurn: false,
    youReady: false,
    opponentReady: true,
    startsAt: null,
    opponentPresence: 'online',
    clock: { id: '10+0', whiteMs: 600000, blackMs: 600000, incrementMs: 0, runningColor: null },
  };
}

function activeMatch() {
  return {
    ...startingMatch(),
    status: 'active',
    youReady: true,
    opponentReady: true,
    yourTurn: true,
    startsAt: new Date(Date.now() + 5000).toISOString(),
    clock: { id: '10+0', whiteMs: 600000, blackMs: 600000, incrementMs: 0, runningColor: null },
  };
}

async function prepareHandoff(page, { holdReady = false } = {}) {
  await mockApi(page);
  let released = !holdReady;
  let releaseReady = () => {};
  const readyGate = new Promise((resolve) => { releaseReady = () => { released = true; resolve(); }; });

  await page.route('**/api/pvp/lobby', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      roster: [
        { username: 'e2e', rating: 1050, tier: 'Intermedio', isSelf: true },
        { username: 'bob', rating: 1210, tier: 'Intermedio', isSelf: false },
      ],
      challenges: [{
        id: 'challenge-handoff-visual',
        challenger: 'bob',
        opponent: 'e2e',
        challengerRating: 1210,
        opponentRating: 1050,
        status: 'pending',
        direction: 'incoming',
      }],
      activeMatch: null,
      messages: [],
      pollAfterMs: 3000,
    }),
  }));
  await page.route('**/api/pvp/challenges/challenge-handoff-visual/accept', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ match: startingMatch() }),
  }));
  await page.route('**/api/pvp/matches/pvp-handoff-visual-1/ready', async (route) => {
    if (holdReady && !released) await readyGate;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ match: activeMatch() }),
    });
  });
  await page.route('**/api/pvp/matches/pvp-handoff-visual-1', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ match: released ? activeMatch() : startingMatch(), pollAfterMs: 3000 }),
  }));

  await login(page);
  await page.getByRole('button', { name: 'Abrir Sala de Duelos 1 contra 1' }).click();
  const lobby = page.getByRole('dialog', { name: 'Duelo 1 contra 1 · War Room' });
  await expect(lobby).toBeVisible();
  await lobby.getByRole('button', { name: 'Aceptar', exact: true }).click();

  const handoff = page.getByRole('dialog', { name: 'Entrando en 1 contra 1' });
  await expect(handoff).toBeVisible();
  return { handoff, releaseReady };
}

test('PvP handoff · desktop seals the duel before authoritative readiness', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { handoff, releaseReady } = await prepareHandoff(page, { holdReady: true });

  await expect(handoff).toHaveAttribute('data-handoff-phase', 'sealing');
  await expect(handoff.getByText('SELLANDO EL DUELO', { exact: true })).toBeVisible();
  await expect(handoff.getByText('e2e', { exact: true })).toBeVisible();
  await expect(handoff.getByText('bob', { exact: true })).toBeVisible();
  await expect(handoff.getByText('1050 Elo', { exact: true })).toBeVisible();
  await expect(handoff.getByText('1210 Elo', { exact: true })).toBeVisible();

  await mkdir(ARTIFACT_DIR, { recursive: true });
  await page.screenshot({
    path: ARTIFACT_DIR + '/pvp-handoff-sealing-desktop-1440x900.png',
    animations: 'disabled',
  });

  releaseReady();
  await expect(handoff).toHaveAttribute('data-handoff-phase', 'opening');
});

test.use({ hasTouch: true, isMobile: true });

test('PvP handoff · Android landscape opens the gate on authoritative start', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  const { handoff } = await prepareHandoff(page);

  await expect(handoff).toHaveAttribute('data-handoff-phase', 'opening');
  await expect(handoff.getByText('PORTÓN ABRIENDO', { exact: true })).toBeVisible();
  await expect(handoff.getByText(/Entrando en 1 vs 1 en/)).toBeVisible();

  const box = await handoff.boundingBox();
  expect(box).not.toBeNull();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(390);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  await mkdir(ARTIFACT_DIR, { recursive: true });
  await page.screenshot({
    path: ARTIFACT_DIR + '/pvp-handoff-opening-android-landscape-844x390.png',
    animations: 'disabled',
  });
});
