import { describe, expect, it, vi } from 'vitest';
import { buildShortCounterfactual, counterfactualInputFromReportMove } from './postGameCounterfactual.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('post-game short counterfactual', () => {
  it('starts from the proven suggested move and asks deterministic analysis only for follow-ups', async () => {
    const analyzeMove = vi.fn()
      .mockResolvedValueOnce({ suggested: { from: 'b8', to: 'c6', san: 'Nc6' } })
      .mockResolvedValueOnce({ suggested: { from: 'f1', to: 'b5', san: 'Bb5' } });

    const result = await buildShortCounterfactual({
      fen: START_FEN,
      suggested: 'e4',
      analyzeMove,
    });

    expect(result.line.map((move) => move.san)).toEqual(['e4', 'Nc6', 'Bb5']);
    expect(analyzeMove).toHaveBeenCalledTimes(2);
    expect(analyzeMove.mock.calls[0][0]).toContain(' b ');
  });

  it('never expands beyond three plies even if requested', async () => {
    const analyzeMove = vi.fn()
      .mockResolvedValue({ suggested: { from: 'b8', to: 'c6', san: 'Nc6' } });

    const result = await buildShortCounterfactual({
      fen: START_FEN,
      suggested: 'e4',
      analyzeMove,
      maxPlies: 99,
    });

    expect(result.line).toHaveLength(2);
    expect(analyzeMove).toHaveBeenCalledTimes(2);
  });

  it('fails closed when the stored suggestion is not legal in the factual FEN', async () => {
    const analyzeMove = vi.fn();
    await expect(buildShortCounterfactual({
      fen: START_FEN,
      suggested: 'Qa8',
      analyzeMove,
    })).resolves.toBeNull();
    expect(analyzeMove).not.toHaveBeenCalled();
  });

  it('builds a factual counterfactual input from the analyzed report move', () => {
    expect(counterfactualInputFromReportMove({
      suggested: 'Nf3',
      suggestedFrom: 'g1',
      suggestedTo: 'f3',
      suggestedPromotion: null,
      context: { fenBefore: START_FEN },
    })).toEqual({
      fen: START_FEN,
      suggested: { from: 'g1', to: 'f3', promotion: null, san: 'Nf3' },
    });
  });

  it('falls back to factual SAN but never invents missing evidence', () => {
    expect(counterfactualInputFromReportMove({
      suggested: 'e4',
      context: { fenBefore: START_FEN },
    })).toEqual({ fen: START_FEN, suggested: { san: 'e4' } });
    expect(counterfactualInputFromReportMove({ suggested: 'e4' })).toBeNull();
    expect(counterfactualInputFromReportMove({ context: { fenBefore: START_FEN } })).toBeNull();
  });
});
