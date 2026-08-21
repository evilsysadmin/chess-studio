import { describe, expect, it } from 'vitest';
import { LAB_START_FEN, fenFromLabState, mapFromPlacement, parseLabPosition } from './labPosition.js';

describe('Laboratorio FEN', () => {
  it('la posición inicial conserva los cuatro derechos de enroque', () => {
    expect(LAB_START_FEN).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  });

  it('conserva todos los metadatos al pegar un FEN completo', () => {
    const raw = 'r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 7 19';
    const parsed = parseLabPosition(raw);
    expect(parsed.fen).toBe(raw);
    expect(parsed.castling).toBe('KQkq');
    expect(parsed.halfmove).toBe('7');
    expect(parsed.fullmove).toBe('19');
  });

  it('no inventa enroques si solo se pega la colocación', () => {
    const parsed = parseLabPosition('r3k2r/8/8/8/8/8/8/R3K2R', 'w');
    expect(parsed.fen).toContain(' w - - 0 1');
  });

  it('serializa el estado del editor sin perder metadatos explícitos', () => {
    const map = mapFromPlacement('r3k2r/8/8/8/8/8/8/R3K2R');
    expect(fenFromLabState({ map, turn: 'b', castling: 'kq', ep: '-', halfmove: '3', fullmove: '8' }))
      .toBe('r3k2r/8/8/8/8/8/8/R3K2R b kq - 3 8');
  });
});
