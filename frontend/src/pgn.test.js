import { describe, it, expect } from 'vitest';
import { toPGN, pgnResult } from './pgn.js';

describe('pgnResult', () => {
  it('mate a favor del humano da el resultado correcto según su color', () => {
    expect(pgnResult('checkmate', 'b', 'w')).toBe('1-0'); // humano blancas, gana
    expect(pgnResult('checkmate', 'w', 'b')).toBe('0-1'); // humano negras, gana
  });

  it('mate en contra del humano da el resultado correcto según su color', () => {
    expect(pgnResult('checkmate', 'w', 'w')).toBe('0-1'); // humano blancas, pierde
    expect(pgnResult('checkmate', 'b', 'b')).toBe('1-0'); // humano negras, pierde
  });

  it('tablas siempre da 1/2-1/2, sin importar el color', () => {
    expect(pgnResult('draw', 'w', 'w')).toBe('1/2-1/2');
    expect(pgnResult('stalemate', 'b', 'w')).toBe('1/2-1/2');
  });

  it('partida en curso da *', () => {
    expect(pgnResult('playing', 'w', 'w')).toBe('*');
  });
});

describe('toPGN', () => {
  it('incluye los headers básicos y la lista de jugadas numerada', () => {
    const history = [{ san: 'e4' }, { san: 'e5' }, { san: 'Nf3' }];
    const pgn = toPGN(history, { white: 'Jugador', black: 'CPU', result: '*' });
    expect(pgn).toContain('[White "Jugador"]');
    expect(pgn).toContain('[Black "CPU"]');
    expect(pgn).toContain('1. e4 e5 2. Nf3');
  });
});
