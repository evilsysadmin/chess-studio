import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { pickHansLegalSuggestion } from './WarRoomHansBoardPeek.js';

describe('Hans board peek', () => {
  it('elige siempre una jugada legal de la posición visible', () => {
    const chess = new Chess();
    const suggestion = pickHansLegalSuggestion(chess.fen(), 0.42);
    expect(suggestion).toBeTruthy();
    const legal = chess.moves({ verbose: true });
    expect(legal.some((move) => move.from === suggestion.from && move.to === suggestion.to && move.san === suggestion.san)).toBe(true);
    expect(suggestion.line).toBe(`Yo probaría ${suggestion.san}.`);
  });

  it('usa el azar sólo para escoger dentro del conjunto legal', () => {
    const chess = new Chess();
    const first = pickHansLegalSuggestion(chess.fen(), 0);
    const last = pickHansLegalSuggestion(chess.fen(), 0.999999);
    expect(first).toBeTruthy();
    expect(last).toBeTruthy();
    expect(first.san).not.toBe(last.san);
  });

  it('no inventa jugadas si el FEN es inválido o la partida terminó', () => {
    expect(pickHansLegalSuggestion('esto-no-es-fen', 0.5)).toBeNull();
    expect(pickHansLegalSuggestion('7k/5Q2/7K/8/8/8/8/8 b - - 0 1', 0.5)).toBeNull();
  });
});
