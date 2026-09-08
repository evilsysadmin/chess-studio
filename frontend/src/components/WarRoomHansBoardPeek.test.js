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

  it('usa el azar sólo para escoger dentro del conjunto legal', () => {
    const chess = new Chess();
    const first = pickHansLegalSuggestion(chess.fen(), 0);
    const last = pickHansLegalSuggestion(chess.fen(), 0.999999);
    expect(first).toBeTruthy();
    expect(last).toBeTruthy();
    expect(first.san).not.toBe(last.san);
  });

  it('describe un caballo con origen y destino sin exigir notación SAN al usuario', () => {
    const chess = new Chess('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    const legal = chess.moves({ verbose: true });
    const knightIndex = legal.findIndex((move) => move.piece === 'n');
    const suggestion = pickHansLegalSuggestion(chess.fen(), (knightIndex + 0.1) / legal.length);
    expect(suggestion.piece).toBe('n');
    expect(suggestion.line).toMatch(/^Yo probaría caballo de [a-h][1-8] a [a-h][1-8]\.$/);
  });

  it('no inventa jugadas si el FEN es inválido o la partida terminó', () => {
    expect(pickHansLegalSuggestion('esto-no-es-fen', 0.5)).toBeNull();
    expect(pickHansLegalSuggestion('7k/5Q2/7K/8/8/8/8/8 b - - 0 1', 0.5)).toBeNull();
  });
});