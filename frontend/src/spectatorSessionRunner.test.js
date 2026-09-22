import { describe, expect, it, vi } from 'vitest';
import { Chess } from 'chess.js';
import { runSpectatorSession } from './spectatorSessionRunner.js';

describe('spectatorSessionRunner', () => {
  it('continúa con una jugada legal local si el análisis remoto falla', async () => {
    const chess = new Chess();
    let stop = false;
    const onMove = vi.fn(() => { stop = true; });
    const onError = vi.fn();
    const result = await runSpectatorSession({
      chess, whiteLevel: 40, blackLevel: 40, paceMs: 0,
      shouldStop: () => stop,
      analyzePosition: async () => { throw new Error('503'); },
      onMove, onError,
    });
    expect(result).toBe('stopped');
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(chess.history()).toHaveLength(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it('rechaza respuestas remotas ilegales sin bloquear la sesión', async () => {
    const chess = new Chess();
    let stop = false;
    const onMove = vi.fn(() => { stop = true; });
    await runSpectatorSession({
      chess, whiteLevel: 50, blackLevel: 50, paceMs: 0,
      shouldStop: () => stop,
      analyzePosition: async () => ({ from: 'a1', to: 'a8' }),
      onMove,
    });
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(chess.history()).toHaveLength(1);
  });
});
