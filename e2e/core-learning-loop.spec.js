import { expect, test } from '@playwright/test';
import { buttonWithVisibleText, clickBoardMove, gameTurn, login, mockApi } from './helpers.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_F3_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq e6 0 2';
const FOOLS_MATE = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3';

async function installCoreLearningScenario(page) {
  let game = null;

  await page.route('http://localhost:4000/api/analyze-move', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const payload = route.request().postDataJSON?.() ?? {};
    const played = `${payload.from || ''}${payload.to || ''}`;

    if (played === 'f2f3') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          suggested: { san: 'e4', from: 'e2', to: 'e4', piece: 'p' },
          evalAfterSuggested: 20,
          evalAfterPlayed: -40,
          factualEvalAfterSuggested: 20,
          factualEvalAfterPlayed: -40,
          loss: 60,
          analysisDepth: 2,
          candidateCount: 20,
        }),
      });
    }

    if (played === 'g2g4') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          suggested: { san: 'g3', from: 'g2', to: 'g3', piece: 'p' },
          suggestedReply: { san: 'd5', from: 'd7', to: 'd5', piece: 'p' },
          playedReply: { san: 'Qh4#', from: 'd8', to: 'h4', piece: 'q' },
          evalAfterSuggested: -20,
          evalAfterPlayed: -100000,
          factualEvalAfterSuggested: -20,
          factualEvalAfterPlayed: -99999,
          loss: 99979,
          analysisDepth: 3,
          candidateCount: 19,
        }),
      });
    }

    // Counterfactual/exam continuations do not carry a played move. Keep the
    // line deterministic and legal without weakening the evidence above.
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        suggested: { san: 'd5', from: 'd7', to: 'd5', piece: 'p' },
        evalAfterSuggested: 0,
        evalAfterPlayed: null,
      }),
    });
  });

  await page.route('http://localhost:4000/api/games**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (path.endsWith('/games') && method === 'POST') {
      const payload = route.request().postDataJSON?.() ?? {};
      game = {
        id: `e2e-core-loop-${Date.now()}`,
        fen: START,
        turn: 'w',
        humanColor: payload.color === 'b' ? 'b' : 'w',
        difficulty: Math.round(Number(payload.difficulty ?? 50)),
        status: 'playing',
        insufficientMatingMaterial: { w: false, b: false },
        isGameOver: false,
        history: [],
        lastMove: null,
        initialFen: START,
        ghostStyle: null,
      };
      return json(game, 201);
    }

    const moveMatch = path.match(/\/games\/([^/]+)\/move$/);
    if (moveMatch && method === 'POST' && game) {
      const payload = route.request().postDataJSON?.() ?? {};
      if (game.history.length === 0 && payload.from === 'f2' && payload.to === 'f3') {
        game = {
          ...game,
          fen: AFTER_F3_E5,
          turn: 'w',
          history: [
            { from: 'f2', to: 'f3', san: 'f3', piece: 'p', by: 'human' },
            { from: 'e7', to: 'e5', san: 'e5', piece: 'p', by: 'cpu' },
          ],
          lastMove: { from: 'e7', to: 'e5', san: 'e5', piece: 'p', by: 'cpu' },
        };
        return json(game);
      }
      if (game.history.length === 2 && payload.from === 'g2' && payload.to === 'g4') {
        game = {
          ...game,
          fen: FOOLS_MATE,
          turn: 'w',
          status: 'checkmate',
          isGameOver: true,
          history: [
            ...game.history,
            { from: 'g2', to: 'g4', san: 'g4', piece: 'p', by: 'human' },
            { from: 'd8', to: 'h4', san: 'Qh4#', piece: 'q', by: 'cpu' },
          ],
          lastMove: { from: 'd8', to: 'h4', san: 'Qh4#', piece: 'q', by: 'cpu' },
        };
        return json(game);
      }
      return json({ detail: `E2E core loop no esperaba ${payload.from}-${payload.to}` }, 400);
    }

    const gameMatch = path.match(/\/games\/([^/]+)$/);
    if (gameMatch && method === 'GET') return game ? json(game) : json({ detail: 'Partida no encontrada' }, 404);
    if (gameMatch && method === 'DELETE') {
      game = null;
      return route.fulfill({ status: 204, body: '' });
    }
    return route.fallback();
  });
}

test('bucle canónico · partida → incidente → explicación → entrenamiento → nueva partida', async ({ page }) => {
  test.setTimeout(90_000);
  await mockApi(page);
  await installCoreLearningScenario(page);
  await login(page);

  await buttonWithVisibleText(page, 'Partida rápida').click();
  await page.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expect(gameTurn(page)).toBeVisible();

  await clickBoardMove(page, 'f2', 'f3');
  await expect(gameTurn(page)).toBeVisible();
  await clickBoardMove(page, 'g2', 'g4');

  const endgame = page.locator('.endgame-dialog');
  await expect(endgame).toBeVisible();
  await expect(endgame.getByText('PARTIDA FINALIZADA', { exact: true })).toBeVisible();
  await endgame.getByRole('button', { name: 'Resumen de la partida', exact: true }).click();

  const report = page.getByRole('dialog', { name: 'Resumen de la partida' });
  await expect(report).toBeVisible();
  await expect(report.getByText('Precisión estimada', { exact: true })).toBeVisible({ timeout: 15_000 });

  const examIntro = report.locator('[data-post-game-exam="ready"]');
  await expect(examIntro).toBeVisible();
  await examIntro.getByRole('button', { name: 'Hacer examen', exact: true }).click();

  const activeExam = report.locator('[data-post-game-exam="active"]');
  await expect(activeExam).toBeVisible();
  await clickBoardMove(page, 'g2', 'g3', activeExam);
  await expect(activeExam.getByText('✓ Correcto.', { exact: true })).toBeVisible();
  await expect(activeExam).toContainText('En la partida jugaste g4');
  await expect(activeExam).toContainText('La alternativa era g3');
  await activeExam.getByRole('button', { name: 'Ver resultado', exact: true }).click();
  await expect(report.locator('[data-post-game-exam="finished"]')).toContainText('1/1 a la primera');

  // El informe ya persistió la posición personal. Volvemos al resultado y
  // entramos al entrenamiento por el CTA real del producto.
  await page.keyboard.press('Escape');
  await expect(report).toHaveCount(0);
  await expect(endgame).toBeVisible();
  await endgame.getByRole('button', { name: 'Más opciones', exact: true }).click();
  await endgame.getByRole('button', { name: 'Entrenar mis errores', exact: true }).click();

  await expect(page.locator('.puzzle-screen-personal')).toBeVisible();
  await expect(page.getByText('Caso reconstruido desde una de tus partidas.', { exact: true })).toBeVisible();
  await clickBoardMove(page, 'g2', 'g3');
  await expect(page.getByText('¡Resuelto!', { exact: true })).toBeVisible();

  // Cerramos el entrenamiento, salimos de la partida finalizada y comprobamos
  // que el loop realmente termina en otra partida jugable, no en un callejón.
  await page.getByRole('button', { name: /Volver al menú/ }).click();
  const returnedEndgame = page.locator('.endgame-dialog');
  if (await returnedEndgame.isVisible().catch(() => false)) {
    const more = returnedEndgame.getByRole('button', { name: 'Más opciones', exact: true });
    if (await more.isVisible().catch(() => false)) await more.click();
    await returnedEndgame.getByRole('button', { name: 'Volver al menú', exact: true }).click();
  }

  await expect(buttonWithVisibleText(page, 'Partida rápida')).toBeVisible();
  await buttonWithVisibleText(page, 'Partida rápida').click();
  const quickMatch = page.getByRole('dialog', { name: 'Configurar partida rápida' });
  await expect(quickMatch.getByRole('button', { name: '3D', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await quickMatch.getByRole('button', { name: 'Empezar partida', exact: true }).click();
  await expect(gameTurn(page)).toBeVisible();
});