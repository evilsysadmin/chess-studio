import { describe, expect, it } from 'vitest';
import { LAB_START_FEN, assertLegalLabPosition, fenFromLabState, mapFromPlacement, parseLabPosition, validateLabPosition } from './labPosition.js';

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

  it('rechaza derechos de enroque sin rey/torre en su casilla histórica', () => {
    const result = validateLabPosition('4k3/8/8/8/8/8/8/4K3 w K - 0 1');
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/enroque blanco corto/i);
  });

  it('rechaza peones en primera u octava fila', () => {
    expect(validateLabPosition('4k3/8/8/8/8/8/8/P3K3 w - - 0 1').valid).toBe(false);
  });

  it('rechaza en-passant incoherente con turno/peón previo', () => {
    expect(validateLabPosition('4k3/8/8/8/8/8/8/4K3 w - e6 0 1').valid).toBe(false);
  });


  it('rechaza reyes adyacentes', () => {
    const result = validateLabPosition('8/8/8/8/8/8/4k3/4K3 w - - 0 1');
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/reyes.*adyacentes/i);
  });

  it('rechaza material que exigiría promociones sin peones disponibles', () => {
    const result = validateLabPosition('4k3/pppppppp/8/8/8/8/PPPPPPPP/3QKQ2 w - - 0 1');
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/material blanco.*promociones/i);
  });

  it('detecta dos alfiles del mismo color cuando no queda presupuesto de promoción', () => {
    const result = validateLabPosition('4k3/pppppppp/8/8/8/8/PPPPPPPP/2B1K1B1 w - - 0 1');
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/material blanco.*promociones/i);
  });

  it('rechaza que el rey del bando que no mueve ya esté en jaque', () => {
    const result = validateLabPosition('4k3/8/8/8/8/8/4R3/4K3 w - - 0 1');
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/no mueve.*jaque/i);
  });

  it('acepta una posición custom legal con el rey al turno en jaque', () => {
    expect(() => assertLegalLabPosition('4k3/8/8/8/8/8/4r3/4K3 w - - 0 1')).not.toThrow();
  });
});
