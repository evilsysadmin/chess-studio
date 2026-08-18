import { describe, it, expect } from 'vitest';
import { formatLongMove, castlingRookMove } from './notation.js';

describe('formatLongMove', () => {
  it('antepone la letra de la pieza (mayúscula), salvo peón', () => {
    expect(formatLongMove({ piece: 'n', from: 'g1', to: 'f3' })).toBe('Ng1-f3');
    expect(formatLongMove({ piece: 'p', from: 'e2', to: 'e4' })).toBe('e2-e4');
  });

  it('usa "x" en vez de "-" cuando hay captura', () => {
    expect(formatLongMove({ piece: 'b', from: 'c4', to: 'f7', captured: 'p' })).toBe('Bc4xf7');
  });

  it('da string vacío si falta from/to', () => {
    expect(formatLongMove(null)).toBe('');
    expect(formatLongMove({ piece: 'k' })).toBe('');
  });
});

describe('castlingRookMove', () => {
  it('detecta los 4 enroques posibles', () => {
    expect(castlingRookMove('k', 'e1', 'g1')).toEqual({ from: 'h1', to: 'f1' });
    expect(castlingRookMove('k', 'e1', 'c1')).toEqual({ from: 'a1', to: 'd1' });
    expect(castlingRookMove('k', 'e8', 'g8')).toEqual({ from: 'h8', to: 'f8' });
    expect(castlingRookMove('k', 'e8', 'c8')).toEqual({ from: 'a8', to: 'd8' });
  });

  it('da null para una jugada de rey que no es enroque', () => {
    expect(castlingRookMove('k', 'e1', 'e2')).toBeNull();
    expect(castlingRookMove('k', 'e1', 'f1')).toBeNull();
  });

  it('da null si la pieza no es un rey, aunque las casillas coincidan con un enroque', () => {
    expect(castlingRookMove('q', 'e1', 'g1')).toBeNull();
    expect(castlingRookMove('r', 'e1', 'c1')).toBeNull();
  });

  it('da null si falta la pieza', () => {
    expect(castlingRookMove(undefined, 'e1', 'g1')).toBeNull();
  });
});
