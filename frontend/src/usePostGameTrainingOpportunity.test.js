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
      loss: 300,
      evalAfterSuggested: 300,
      evalAfterPlayed: 0,
      factualEvalAfterSuggested: 300,
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

  it('ofrece el tercer error factual si los dos primeros no forman puzzles, y lo guarda antes de ofrecerlo', async () => {
    analyzeMove
      .mockResolvedValueOnce({ suggested: { from: 'e1', to: 'e9', san: 'Ke9' }, loss: 500 })
      .mockResolvedValueOnce({ suggested: { from: 'g1', to: 'f3', san: 'Nf3' }, loss: 400 })
      .mockResolvedValueOnce({ suggested: { from: 'f1', to: 'b5', san: 'Bb5' }, loss: 300 });
    const game = {
      id: 'g-third-trainable',
      history: [
        { from: 'e2', to: 'e4', san: 'e4', piece: 'p' },
        { from: 'e7', to: 'e5', san: 'e5', piece: 'p' },
        { from: 'g1', to: 'f3', san: 'Nf3', piece: 'n' },
        { from: 'b8', to: 'c6', san: 'Nc6', piece: 'n' },
        { from: 'f1', to: 'c4', san: 'Bc4', piece: 'b' },
      ],
    };
    const opportunity = await preparePostGameTrainingOpportunity({ game, humanColor: 'w', meta: { gameId: game.id } });
    expect(opportunity).toMatchObject({ moveNumber: 3, played: 'Bc4', suggested: 'Bb5' });
    expect(JSON.parse(localStorage.getItem('chess-study-personal-puzzles'))).toEqual([
      expect.objectContaining({ id: opportunity.puzzleId, sourceGameId: game.id, suggested: 'Bb5' }),
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
