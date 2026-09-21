import { describe, expect, it, vi } from 'vitest';
import { Chess } from 'chess.js';
import { runStandardCpuMatch } from './standardChessCpuMatch.js';

describe('standard CPU-vs-CPU match runner', () => {
  it('applies a remote legal move without React owning the game loop', async () => {
    const chess = new Chess();
    const controller = new AbortController();
    const moves = [];

    const result = await runStandardCpuMatch({
      chess,
      whiteLevel: 40,
      blackLevel: 60,
      paceMs: 0,
      analyzePosition: vi.fn().mockResolvedValue({ from: 'e2', to: 'e4' }),
      signal: controller.signal,
      onMove: ({ move, turn }) => {
        moves.push({ from: move.from, to: move.to, turn });
        controller.abort();
      },
    });

    expect(moves).toEqual([{ from: 'e2', to: 'e4', turn: 'w' }]);
    expect(chess.get('e4')?.type).toBe('p');
    expect(result.reason).toBe('cancelled');
  });

  it('falls back to a legal local move when remote analysis is unavailable', async () => {
    const chess = new Chess();
    const controller = new AbortController();
    const moves = [];

    const result = await runStandardCpuMatch({
      chess,
      whiteLevel: 50,
      blackLevel: 50,
      paceMs: 0,
      analyzePosition: vi.fn().mockRejectedValue(new Error('analysis offline')),
      signal: controller.signal,
      onMove: ({ move }) => {
        moves.push(move);
        controller.abort();
      },
    });

    expect(moves).toHaveLength(1);
    expect(moves[0].from).toMatch(/^[a-h][1-8]$/);
    expect(moves[0].to).toMatch(/^[a-h][1-8]$/);
    expect(result.reason).toBe('cancelled');
  });
});
