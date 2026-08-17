import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import { OPENINGS, identifyOpening } from './openings.js';

describe('OPENINGS', () => {
  it('todas las secuencias son legales de verdad (reproducidas con chess.js)', () => {
    for (const opening of OPENINGS) {
      const chess = new Chess();
      for (const san of opening.moves) {
        expect(() => chess.move(san), `${opening.name}: "${san}" debería ser legal`).not.toThrow();
      }
    }
  });

  it('no hay nombres repetidos', () => {
    const names = OPENINGS.map((o) => o.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('identifyOpening', () => {
  it('sin jugadas, o con muy pocas, no reconoce nada', () => {
    expect(identifyOpening([])).toBeNull();
    expect(identifyOpening(['e4'])).toBeNull();
  });

  it('reconoce una apertura simple', () => {
    expect(identifyOpening(['e4', 'c5'])).toBe('Defensa Siciliana');
  });

  it('prefiere la coincidencia más específica (más larga), no la primera que matchee', () => {
    const najdorf = ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'];
    expect(identifyOpening(najdorf)).toBe('Defensa Siciliana, Variante Najdorf');
    // con jugadas de más encima, sigue reconociendo la variante específica
    expect(identifyOpening([...najdorf, 'Be2', 'e5'])).toBe('Defensa Siciliana, Variante Najdorf');
  });

  it('distingue variantes de la misma apertura por sus jugadas siguientes', () => {
    const dragon = ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'g6'];
    expect(identifyOpening(dragon)).toBe('Defensa Siciliana, Variante Dragón');
  });

  it('devuelve null si las jugadas no coinciden con ninguna apertura conocida', () => {
    expect(identifyOpening(['a3', 'a6', 'b3', 'b6'])).toBeNull();
  });
});
