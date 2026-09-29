import { beforeEach, describe, expect, it, vi } from 'vitest';

const { analyzeMove } = vi.hoisted(() => ({ analyzeMove: vi.fn() }));
vi.mock('./api.js', () => ({ api: { analyzeMove } }));

import { preparePostGameTrainingOpportunity } from './usePostGameTrainingOpportunity.js';

describe('preparePostGameTrainingOpportunity', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    analyzeMove.mockReset();
  });

  it('prepara un puzzle exacto sólo a partir de un error analizado y legal', async () => {
    analyzeMove.mockResolvedValue({
      suggested: { from: 'a1', to: 'a8', san: 'Ra8+', piece: 'r' },
      evalAfterSuggested: 3,
      evalAfterPlayed: 0,
      factualEvalAfterSuggested: 3,
      factualEvalAfterPlayed: 0,
      analysisDepth: 2,
      candidateCount: 2,
    });
    const game = {
      id: 'g-postgame',
      initialFen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1',
      history: [{ from: 'a1', to: 'a2', san: 'Ra2', piece: 'r', by: 'human' }],
    };
    const opportunity = await preparePostGameTrainingOpportunity({
      game,
      humanColor: 'w',
      meta: { gameId: game.id, initialFen: game.initialFen, mode: 'casual' },
    });
    expect(opportunity).toMatchObject({ moveNumber: 1, played: 'Ra2', suggested: 'Ra8+' });
    expect(opportunity.puzzleId).toMatch(/^personal-/);
    expect(JSON.parse(localStorage.getItem('chess-study-personal-puzzles'))).toEqual([
      expect.objectContaining({ id: opportunity.puzzleId, sourceGameId: game.id, played: 'Ra2', suggested: 'Ra8+' }),
    ]);
  });

  it('no inventa entrenamiento si el análisis no demuestra un error de 80 cp', async () => {
    analyzeMove.mockResolvedValue({
      suggested: { from: 'a1', to: 'a2', san: 'Ra2', piece: 'r' },
      evalAfterSuggested: 0,
      evalAfterPlayed: 0,
    });
    const game = {
      id: 'g-clean',
      initialFen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1',
      history: [{ from: 'a1', to: 'a2', san: 'Ra2', piece: 'r', by: 'human' }],
    };
    await expect(preparePostGameTrainingOpportunity({ game, humanColor: 'w', meta: { gameId: game.id, initialFen: game.initialFen } })).resolves.toBeNull();
  });
});
