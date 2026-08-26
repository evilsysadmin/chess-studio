import { describe, expect, it } from 'vitest';
import { checkedKingSquare } from './boardState.js';

describe('estado visual del tablero', () => {
  it('marca el rey del bando que está en jaque', () => {
    expect(checkedKingSquare('6k1/6Q1/6K1/8/8/8/8/8 b - - 0 1')).toBe('g8');
    expect(checkedKingSquare('6k1/8/8/8/8/6q1/6K1/8 w - - 0 1')).toBe('g2');
  });

  it('no añade un aviso cuando no hay jaque o el FEN no es válido', () => {
    expect(checkedKingSquare('6k1/8/8/8/8/8/6K1/8 w - - 0 1')).toBeNull();
    expect(checkedKingSquare('no es un fen')).toBeNull();
  });
});
