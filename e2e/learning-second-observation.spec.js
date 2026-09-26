import { expect, test } from '@playwright/test';
import {
  buttonWithVisibleText,
  clickBoardMove,
  gameTurn,
  login,
  mockApi,
} from './helpers.js';

const PERSONAL_MATE_FEN = '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1';
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const OBSERVATION_GAME_ID = 'e2e-second-observation';

const OBSERVATION_STEPS = [
  {
    human: { from: 'a2', to: 'a3', san: 'a3', piece: 'p', captured: false, by: 'human' },
    cpu: { from: 'a7', to: 'a6', san: 'a6', piece: 'p', captured: false, by: 'cpu' },
    fen: 'rnbqkbnr/1ppppppp/p7/8/8/P7/1PPPPPPP/RNBQKBNR w KQkq - 0 2',
  },
  {
    human: { from: 'h2', to: 'h3', san: 'h3', piece: 'p', captured: false, by: 'human' },
    cpu: { from: 'h7', to: 'h6', san: 'h6', piece: 'p', captured: false, by: 'cpu' },
    fen: 'rnbqkbnr/1pppppp1/p6p/8/8/P6P/1PPPPPP1/RNBQKBNR w KQkq - 0 3',
  },
  {
    human: { from: 'b2', to: 'b3', san: 'b3', piece: 'p', captured: false, by: 'human' },
    cpu: { from: 'b7', to: 'b6', san: 'b6', piece: 'p', captured: false, by: 'cpu' },
    fen: 'rnbqkbnr/2ppppp1/pp5p/8/8/PP5P/2PPPPP1/RNBQKBNR w KQkq - 0 4',
  },
  {
    human: { from: 'g2', to: 'g3', san: 'g3', piece: 'p', captured: false, by: 'human' },
    cpu: { from: 'd7', to: 'd6', san: 'd6', piece: 'p', captured: false, by: 'cpu' },
    fen: 'rnbqkbnr/2p1ppp1/pp1p3p/8/8/PP4PP/2PPPP2/RNBQKBNR w KQkq - 0 5',
  },
  {
    human: { from: 'e2', to: 'e4', san: 'e4', piece: 'p', captured: false, by: 'human' },
    cpu: { from: 'e7', to: 'e5', san: 'e5', piece: 'p', captured: false, by: 'cpu' },
    fen: 'rnbqkbnr/2p2pp1/pp1p3p/4p3/4P3/PP4PP/2PP1P2/RNBQKBNR w KQkq e6 0 6',
  },
  {
    human: { from: 'd1', to: 'h5', san: 'Qh5', piece: 'q', captured: false, by: 'human' },
    cpu: { from: 'b8', to: 'c6', san: 'Nc6', piece: 'n', captured: false, by: 'cpu' },
    fen: 'r1bqkbnr/2p2pp1/ppnp3p/4p2Q/4P3/PP4PP/2PP1P2/RNB1KBNR w KQkq - 2 7',
  },
  {
    human: { from: 'f1', to: 'c4', san: 'Bc4', piece: 'b', captured: false, by: 'human' },
    cpu: { from: 'g8', to: 'f6', san: 'Nf6', piece: 'n', captured: false, by: 'cpu' },
    fen: 'r1bqkb1r/2p2pp1/ppnp1n1p/4p2Q/2B1P3/PP4PP/2PP1P2/RNB1K1NR w KQkq - 4 8',
  },
  {
    human: { from: 'h5', to: 'f7', san: 'Qxf7#', piece: 'q', captured: true, by: 'human' },
    cpu: null,
    fen: 'r1bqkb1r/2p2Qp1/ppnp1n1p/4p3/2B1P3/PP4PP/2PP1P2/RNB1K1NR b KQkq - 0 8',
  },
];

const OBSERVATION_ANALYSIS = OBSERVATION_STEPS.map(({ human }) => ({
  suggested: {
    from: human.from,
    to: human.to,
    san: human.san,
    piece: human.piece,
  },
  evalAfterSuggested: 0,
  evalAfterPlayed: 0,
  loss: 0,
  factualEvalAfterSuggested: 0,
  factualEvalAfterPlayed: 0,
  analysisDepth: 2,
  candidateCount: 2,
}));

async function dismissHomeGuide(page) {
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (!(await guide.isVisible().catch(() => false))) return;
  const dismiss = guide.getByRole('button', { name: 'Ahora no', exact: true });
  if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
}

function recurringTrainingDebtProfileValue() {
  return JSON.stringify([
    {
      id: 'second-observation-pending',
      kind: 'personal',
      source: 'autopsy',
      title: 'Horquilla pendiente segunda observación',
      description: 'Corrige esta recaída antes de observar una partida nueva.',
      fen: PERSONAL_MATE_FEN,
      solution: ['Ra8#'],
      incidentKeys: ['cpu:KNIGHT_FORK'],
      sourceGameId: 'second-observation-source-3',
      loss: 330,
      createdAt: '2026-09-12T10:00:00Z',
      attempts: 0,
      solves: 0,
      cleanSolves: 0,
    },
    {
      id: 'second-observation-clean-2',
      kind: 'personal',
      source: 'autopsy',
      title: 'Horquilla histórica dos',
      description: 'Caso real ya entrenado.',
      fen: PERSONAL_MATE_FEN,
      solution: ['Ra8#'],
      incidentKeys: ['cpu:KNIGHT_FORK'],
      sourceGameId: 'second-observation-source-2',
      loss: 260,
      createdAt: '2026-09-10T10:00:00Z',
      attempts: 1,
      solves: 1,
      cleanSolves: 1,
      masteredAt: '2026-09-10T10:05:00Z',
    },
    {
      id: 'second-observation-clean-1',
      kind: 'personal',
      source: 'autopsy',
      title: 'Horquilla histórica uno',
      description: 'Caso real ya entrenado.',
      fen: PERSONAL_MATE_FEN,
      solution: ['Ra8#'],
      incidentKeys: ['cpu:KNIGHT_FORK'],
      sourceGameId: 'second-observation-source-1',
      loss: 210,
      createdAt: '2026-09-08T10:00:00Z',
      attempts: 1,
      solves: 1,
      cleanSolves: 1,
      masteredAt: '2026-09-08T10:05:00Z',
    },
  ]);
}

async function installObservationGame(page) {
  let game = null;
  let stepIndex = 0;

  await page.route('**/api/games**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const path = url.pathname;
    const json = (body, status = 200) => route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });

    if (path.endsWith('/games') && method === 'POST') {
      game = {
        id: OBSERVATION_GAME_ID,
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
      };
      stepIndex = 0;
      return json(game, 201);
    }

    if (path.endsWith(`/games/${OBSERVATION_GAME_ID}/move`) && method === 'POST') {
      const step = OBSERVATION_STEPS[stepIndex];
      const payload = request.postDataJSON?.() ?? {};
      if (!step || payload.from !== step.human.from || payload.to !== step.human.to) {
        return json({ detail: `E2E segunda observación esperaba ${step?.human?.from || '?'}-${step?.human?.to || '?'}` }, 400);
      }

      const history = [...game.history, step.human];
      if (step.cpu) history.push(step.cpu);
      const finished = !step.cpu;
      game = {
        ...game,
        fen: step.fen,
        turn: finished ? 'b' : 'w',
        status: finished ? 'checkmate' : 'playing',
        isGameOver: finished,
        history,
        lastMove: step.cpu || step.human,
      };
      stepIndex += 1;
      return json(game);
    }

    if (path.endsWith(`/games/${OBSERVATION_GAME_ID}`) && method === 'GET') {
      return game ? json(game) : json({ detail: 'Partida no encontrada' }, 404);
    }

    if (path.endsWith(`/games/${OBSERVATION_GAME_ID}`) && method === 'DELETE') {
      game = null;
      return route.fulfill({ status: 204, body: '' });
    }

    return route.fallback();
  });
}

async function installObservationAnalysis(page) {
  let analysisIndex = 0;
  await page.route('**/api/analyze-move', async (route) => {
    const result = OBSERVATION_ANALYSIS[analysisIndex++];
    if (!result) {
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'E2E sin análisis de segunda observación preparado' }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(result),
    });
  });
}

async function startObservationGame2D(page) {
  await buttonWithVisibleText(page, 'Partida rápida').click();
  const dialog = page.getByRole('dialog', { name: 'Configurar partida rápida' });
  await expect(dialog).toBeVisible();
  await dialog.locator('details.quick-match-settings > summary').click();
  const renderer = dialog.getByRole('group', { name: 'Tipo de tablero' });
  await renderer.getByRole('button', { name: '2D', exact: true }).click();
  await expect(renderer.getByRole('button', { name: '2D', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expect(page.getByRole('group', { name: /Tablero de ajedrez/ })).toBeVisible();
}

test('Home · el avatar residente de Matthias abre Así juegas · entrenamiento → segunda observación real no sobreafirma mejora', async ({ page }) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => { Math.random = () => 0; });
  await mockApi(page, {
    profileSeed: {
      'chess-study-personal-puzzles': recurringTrainingDebtProfileValue(),
    },
  });
  await login(page);
  await dismissHomeGuide(page);

  const corner = page.getByRole('complementary', { name: 'Rincón de Matthias' });
  await corner.getByRole('button', { name: 'Abrir Así juegas con Matthias', exact: true }).click();
  await page.getByRole('tab', { name: /Errores/ }).click();
  await expect(page.getByText('Horquillas de caballo sufridas', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Entrenar este patrón →', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Horquilla pendiente segunda observación', exact: true })).toBeVisible();
  await clickBoardMove(page, 'a1', 'a8');
  await expect(page.getByText('¡Resuelto!', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '← Volver al menú', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Así juegas', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '← Volver al menú', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Modos principales', exact: true })).toBeVisible();

  await installObservationGame(page);
  await installObservationAnalysis(page);
  await startObservationGame2D(page);
  for (let index = 0; index < OBSERVATION_STEPS.length; index += 1) {
    const { human } = OBSERVATION_STEPS[index];
    await clickBoardMove(page, human.from, human.to);
    if (index < OBSERVATION_STEPS.length - 1) await expect(gameTurn(page)).toBeVisible();
  }

  const endgame = page.getByRole('dialog').filter({
    has: page.getByRole('heading', { name: 'Jaque mate', exact: true }),
  });
  await expect(endgame).toBeVisible();
  await endgame.getByRole('button', { name: 'Más opciones', exact: true }).click();
  await endgame.getByRole('button', { name: 'Resumen de la partida', exact: true }).click();

  const report = page.getByRole('dialog', { name: 'Resumen de la partida', exact: true });
  await expect(report.locator('[data-clean-game="true"]')).toContainText('PARTIDA LIMPIA', { timeout: 20_000 });

  const observation = await page.evaluate((gameId) => {
    const records = JSON.parse(localStorage.getItem('chess-study-clean-games-v1') || '{}');
    return records[gameId] || null;
  }, OBSERVATION_GAME_ID);
  expect(observation).toMatchObject({
    gameId: OBSERVATION_GAME_ID,
    analyzedCount: 8,
    sufficientSample: true,
    clean: true,
    incidentCoverageSufficient: true,
  });
  expect(observation.incidentKeys).not.toContain('cpu:KNIGHT_FORK');

  await report.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await endgame.getByRole('button', { name: 'Ver siguiente objetivo', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Modos principales', exact: true })).toBeVisible();

  const homeCorner = page.getByRole('complementary', { name: 'Rincón de Matthias' });
  await homeCorner.getByRole('button', { name: 'Abrir Así juegas con Matthias', exact: true }).click();
  await page.getByRole('tab', { name: /Errores/ }).click();

  const pattern = page.locator('.insights-recurring-error-card').filter({ hasText: 'Horquillas de caballo sufridas' });
  await expect(pattern).toHaveCount(1);
  await expect(pattern.locator('[data-improvement-state="no-sample"]')).toContainText('falta observar nuevas partidas');
  await expect(pattern).not.toContainText('Mejora probable');
  await expect(pattern).not.toContainText('Corregido con muestra suficiente');
});
