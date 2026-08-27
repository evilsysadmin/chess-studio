import { describe, expect, it } from 'vitest';
import { historyMoveNumber, historyMoverColor, historyStart } from './historyTimeline.js';

describe('historyTimeline', () => {
  it('interpreta turno y contador de una FEN que empieza con negras', () => {
    const fen = '4k3/8/8/8/8/8/4P3/4K3 b - - 0 23';
    expect(historyStart(fen)).toEqual({ color: 'b', fullmove: 23, valid: true });
    expect(historyMoverColor(0, fen)).toBe('b');
    expect(historyMoverColor(1, fen)).toBe('w');
    expect(historyMoveNumber(0, fen)).toBe(23);
    expect(historyMoveNumber(1, fen)).toBe(24);
  });

  it('degrada una FEN parcial sin romper estadísticas offline', () => {
    expect(historyStart('basura')).toEqual({ color: 'w', fullmove: 1, valid: false });
    expect(historyMoverColor(0, 'basura')).toBe('w');
  });
});
