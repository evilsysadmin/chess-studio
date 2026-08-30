import { expect, test } from '@playwright/test';
import {
  clickBoardMove,
  gameStatus,
  gameTurn,
  login,
  mockApi,
  startPracticeGame,
  startQuickGame,
  startTournamentGame,
} from './helpers.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const GAME_SCREEN_MODES = [
  ['Partida rápida', startQuickGame],
  ['Torneo', startTournamentGame],
  ['Partida de práctica', startPracticeGame],
];

for (const [label, launch] of GAME_SCREEN_MODES) {
  test(`${label} · jugada real → respuesta CPU → vuelve a Tu turno sin freeze ni Home`, async ({ page }) => {
    await mockApi(page, { gameScenario: 'opening' });
    await login(page);
    await launch(page);

    await clickBoardMove(page, 'e2', 'e4');
    await expect(gameTurn(page)).toBeVisible();
    await expect(page.getByRole('region', { name: 'Hoy en Chess Studio' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Casilla e4, peón blanco/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Casilla e5, peón negro/i })).toBeVisible();
  });

  test(`${label} · jaque actualiza estado y marca al rey sin bloquear la partida`, async ({ page }) => {
    await mockApi(page, { gameScenario: 'check' });
    await login(page);
    await launch(page);

    await clickBoardMove(page, 'e2', 'e8');
    await expect(gameStatus(page).getByText('Jaque', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Casilla h8, rey negro, rey en jaque/i })).toBeVisible();
    await expect(page.getByRole('dialog', { name: /partida finalizada/i })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Hoy en Chess Studio' })).toHaveCount(0);
  });

  test(`${label} · mate termina exactamente una vez y no cae a Home`, async ({ page }) => {
    await mockApi(page, { gameScenario: 'mate' });
    await login(page);
    await launch(page);

    await clickBoardMove(page, 'g6', 'g7');
    const endgame = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Jaque mate', exact: true }) });
    await expect(endgame).toBeVisible();
    await expect(endgame.getByText('¡Ganaste la partida!', { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Hoy en Chess Studio' })).toHaveCount(0);
    await expect(page.locator('.error-boundary-screen')).toHaveCount(0);
  });
}

test('Partida de práctica · Deshacer revierte humano + CPU sin romper la pantalla', async ({ page }) => {
  await mockApi(page, { gameScenario: 'opening' });
  await page.route('http://localhost:4000/api/games/*/undo', async (route) => {
    const match = new URL(route.request().url()).pathname.match(/\/games\/([^/]+)\/undo$/);
    const id = match?.[1] || 'e2e-game-1';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id,
        fen: START_FEN,
        turn: 'w',
        humanColor: 'w',
        difficulty: 50,
        status: 'playing',
        insufficientMatingMaterial: { w: false, b: false },
        isGameOver: false,
        history: [],
        lastMove: null,
        initialFen: null,
        ghostStyle: null,
      }),
    });
  });
  await login(page);
  await startPracticeGame(page);

  await clickBoardMove(page, 'e2', 'e4');
  await expect(page.getByRole('button', { name: /^Casilla e4, peón blanco/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Casilla e5, peón negro/i })).toBeVisible();

  await page.getByRole('button', { name: 'Deshacer jugada', exact: true }).click();

  await expect(gameTurn(page)).toBeVisible();
  await expect(page.getByRole('button', { name: /^Casilla e2, peón blanco/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Casilla e7, peón negro/i })).toBeVisible();
  await expect(page.locator('.error-boundary-screen')).toHaveCount(0);
});
