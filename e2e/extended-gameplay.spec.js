import { expect, test } from '@playwright/test';
import {
  buttonWithVisibleText,
  clickBoardMove,
  gameStatus,
  login,
  mockApi,
  openMoreGameModes,
  startGhostGame,
  startLabGame,
} from './helpers.js';

function mirrorReadyProfileSeed() {
  const humanMoves = [
    { san: 'e4', piece: 'p' }, { san: 'Nf3', piece: 'n' }, { san: 'Bc4', piece: 'b' }, { san: 'O-O', piece: 'k' },
  ];
  const cpuMoves = [
    { san: 'e5', piece: 'p' }, { san: 'Nc6', piece: 'n' }, { san: 'Bc5', piece: 'b' }, { san: 'Nf6', piece: 'n' },
  ];
  const records = Array.from({ length: 3 }, (_, index) => ({
    id: `mirror-e2e-${index + 1}`,
    outcome: index === 2 ? 'draw' : 'win',
    mode: 'casual',
    humanColor: 'w',
    moves: humanMoves.flatMap((move, ply) => [move, cpuMoves[ply]]),
  }));
  const cache = Object.fromEntries(records.map((record, index) => [record.id, { worst: { loss: 110 + index * 10 } }]));
  return {
    'chess-study-game-history': JSON.stringify(records),
    'chess-study-worst-move-cache': JSON.stringify(cache),
  };
}

for (const [label, launch, profileSeed] of [
  ['Laboratorio', startLabGame, {}],
  ['Rival Fantasma', startGhostGame, mirrorReadyProfileSeed()],
]) {
  test(`${label} · jaque usa el mismo contrato visual/ajedrecístico`, async ({ page }) => {
    await mockApi(page, { gameScenario: 'check', profileSeed });
    await login(page);
    await launch(page);
    await clickBoardMove(page, 'e2', 'e8');
    await expect(gameStatus(page).getByText('Jaque', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Casilla h8, rey negro, rey en jaque/i })).toBeVisible();
    await expect(page.locator('.error-boundary-screen')).toHaveCount(0);
  });

  test(`${label} · mate termina limpio y conserva el contexto del modo`, async ({ page }) => {
    await mockApi(page, { gameScenario: 'mate', profileSeed });
    await login(page);
    await launch(page);
    await clickBoardMove(page, 'g6', 'g7');
    const endgame = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Jaque mate', exact: true }) });
    await expect(endgame).toBeVisible();
    await expect(endgame.getByText('¡Ganaste la partida!', { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Hoy en Chess Studio' })).toHaveCount(0);
  });
}

test('Serie mejor de 3 · el mate cierra sólo la partida actual y conserva la serie', async ({ page }) => {
  await mockApi(page, { gameScenario: 'mate' });
  await login(page);
  await buttonWithVisibleText(page, 'Partida rápida').click();
  const modal = page.getByRole('dialog', { name: 'Configurar partida rápida' });
  await modal.locator('details.quick-match-settings summary').click();
  await modal.getByLabel('Formato de serie').selectOption('3');
  await modal.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expect(page.getByText(/Mejor de 3|Serie/i).first()).toBeVisible();

  await clickBoardMove(page, 'g6', 'g7');
  await expect(page.getByRole('heading', { name: 'Jaque mate', exact: true })).toBeVisible();
  await expect(page.getByText(/1–0|1-0|1 victoria|Serie/i).first()).toBeVisible();
  await expect(page.locator('.error-boundary-screen')).toHaveCount(0);
});

test('Puzzles clásicos · un mate en 1 se resuelve de extremo a extremo', async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 0; });
  await mockApi(page);
  await login(page);

  const learningMore = page.locator('details.home-learning-more');
  await learningMore.locator('summary').click();
  await learningMore.getByRole('button').filter({ has: learningMore.getByRole('heading', { name: 'Puzzles', exact: true }) }).click();
  await expect(page.getByText('Mate en 1', { exact: true }).first()).toBeVisible();
  await clickBoardMove(page, 'a1', 'a8');
  await expect(page.getByText('¡Resuelto!', { exact: true })).toBeVisible();
  await expect(page.locator('.error-boundary-screen')).toHaveCount(0);
});
