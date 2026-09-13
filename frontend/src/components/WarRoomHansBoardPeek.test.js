import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { pickHansLegalSuggestion } from './WarRoomHansBoardPeek.js';

describe('Hans board peek', () => {
  it('elige siempre una jugada legal y la explica en lenguaje humano', () => {
    const chess = new Chess();
    const suggestion = pickHansLegalSuggestion(chess.fen(), 0.42);
    expect(suggestion).toBeTruthy();
    const legal = chess.moves({ verbose: true });
    expect(legal.some((move) => move.from === suggestion.from && move.to === suggestion.to && move.san === suggestion.san)).toBe(true);
    expect(suggestion.line).toMatch(/^Yo probaría (peón|caballo|alfil|torre|dama|rey) de [a-h][1-8] a [a-h][1-8]/);
    expect(suggestion.line).not.toBe(`Yo probaría ${suggestion.san}.`);
  });

  it('conserva algo de variedad, pero sólo dentro de las jugadas plausibles mejor puntuadas', () => {
    const chess = new Chess();
    const first = pickHansLegalSuggestion(chess.fen(), 0);
    const last = pickHansLegalSuggestion(chess.fen(), 0.999999);
    expect(first).toBeTruthy();
    expect(last).toBeTruthy();
    expect(first.san).not.toBe(last.san);
  });

  it('prefiere ganar una dama con caballo a una jugada legal cualquiera', () => {
    const chess = new Chess('7k/8/8/4q3/8/5N2/8/7K w - - 0 1');
    const suggestion = pickHansLegalSuggestion(chess.fen(), 0.7);
    expect(suggestion).toBeTruthy();
    expect(suggestion.san).toBe('Nxe5');
    expect(suggestion.piece).toBe('n');
    expect(suggestion.line).toBe('Yo probaría caballo de f3 a e5.');
  });

  it('prioriza un mate en una sobre cualquier consejo decorativo', () => {
    const chess = new Chess('7k/8/6QK/8/8/8/8/8 w - - 0 1');
    const suggestion = pickHansLegalSuggestion(chess.fen(), 0.99);
    expect(suggestion).toBeTruthy();
    expect(suggestion.san).toContain('#');
  });

  it('no inventa jugadas si el FEN es inválido o la partida terminó', () => {
    expect(pickHansLegalSuggestion('esto-no-es-fen', 0.5)).toBeNull();
    expect(pickHansLegalSuggestion('7k/5Q2/7K/8/8/8/8/8 b - - 0 1', 0.5)).toBeNull();
  });
});