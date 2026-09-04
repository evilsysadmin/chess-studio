import { describe, expect, it, vi } from 'vitest';
import { buildShortCounterfactual } from './postGameCounterfactual.js';

describe('post-game short counterfactual', () => {
  it('starts from the proven suggested move and asks the engine only for follow-ups', async () => {
    const analyzePosition = vi.fn()
      .mockResolvedValueOnce({ from: 'b8', to: 'c6', san: 'Nc6' })
      .mockResolvedValueOnce({ from: 'f1', to: 'b5', san: 'Bb5' });

    const result = await buildShortCounterfactual({
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      suggested: 'e4',
      analyzePosition,
    });

    expect(result.line.map((move) => move.san)).toEqual(['e4', 'Nc6', 'Bb5']);
    expect(analyzePosition).toHaveBeenCalledTimes(2);
  });

  it('never expands beyond three plies even if requested', async () => {
    const analyzePosition = vi.fn()
      .mockResolvedValue({ from: 'b8', to: 'c6', san: 'Nc6' });

    const result = await buildShortCounterfactual({
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      suggested: 'e4',
      analyzePosition,
      maxPlies: 99,
    });

    expect(result.line).toHaveLength(2);
    expect(analyzePosition).toHaveBeenCalledTimes(2);
  });

  it('fails closed when the stored suggestion is not legal in the factual FEN', async () => {
    const analyzePosition = vi.fn();
    await expect(buildShortCounterfactual({
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      suggested: 'Qa8',
      analyzePosition,
    })).resolves.toBeNull();
    expect(analyzePosition).not.toHaveBeenCalled();
  });
});
