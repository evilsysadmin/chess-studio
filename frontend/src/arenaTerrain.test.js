import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import {
  ARENA_PRESETS,
  ARENA_START_FEN,
  arenaApplyMove,
  arenaChooseCpuMove,
  arenaLegalMoves,
  arenaPositionKey,
  arenaStatus,
} from './arenaTerrain.js';

describe('Experimental Arenas · terreno bloqueado', () => {
  it('un obstáculo corta rayos de torre y no puede ocuparse', () => {
    const fen = '4k3/8/8/8/3R4/8/8/4K3 w - - 0 1';
    const targets = arenaLegalMoves(fen, ['d6'], { from: 'd4' }).map((move) => move.to);
    expect(targets).toContain('d5');
    expect(targets).not.toContain('d6');
    expect(targets).not.toContain('d7');
    expect(targets).not.toContain('d8');
  });

  it('los caballos saltan terreno pero no pueden aterrizar sobre él', () => {
    const fen = '4k3/8/8/8/8/8/2R5/1N2K3 w - - 0 1';
    const targets = arenaLegalMoves(fen, ['b2', 'c2'], { from: 'b1' }).map((move) => move.to);
    expect(targets).toContain('c3');
    expect(targets).toContain('a3');
    expect(targets).not.toContain('c2');
  });

  it('un muro entre torre y rey elimina un jaque que existiría en ajedrez normal', () => {
    const fen = '4r1k1/8/8/8/8/8/8/4K3 w - - 0 1';
    expect(new Chess(fen).isCheck()).toBe(true);
    expect(arenaStatus(fen, ['e4'])).toBe('playing');
  });

  it('filtra los movimientos ficticios del obstáculo al resolver mate', () => {
    const fen = '7k/6Q1/5K2/8/8/8/8/8 b - - 0 1';
    expect(arenaStatus(fen, ['a1'])).toBe('checkmate');
    expect(arenaLegalMoves(fen, ['a1'])).toHaveLength(0);
  });

  it('el enroque respeta terreno sólido en su corredor', () => {
    const fen = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
    const kingMoves = arenaLegalMoves(fen, ['f1'], { from: 'e1' });
    expect(kingMoves.some((move) => move.to === 'g1')).toBe(false);
    expect(kingMoves.some((move) => move.to === 'c1')).toBe(true);
  });

  it('aplica una jugada real sin contaminar el FEN con piezas-obstáculo', () => {
    const applied = arenaApplyMove(ARENA_START_FEN, ['c4'], { from: 'e2', to: 'e4' });
    expect(applied).not.toBeNull();
    const next = new Chess(applied.fen);
    expect(next.turn()).toBe('b');
    expect(next.get('c4')).toBeUndefined();
    expect(next.get('e4')).toMatchObject({ type: 'p', color: 'w' });
  });

  it('la triple repetición usa posición real + terreno como identidad', () => {
    const blocked = ARENA_PRESETS[0].blocked;
    const key = arenaPositionKey(ARENA_START_FEN, blocked);
    expect(arenaStatus(ARENA_START_FEN, blocked, [key, key])).toBe('playing');
    expect(arenaStatus(ARENA_START_FEN, blocked, [key, key, key])).toBe('repetition');
  });

  it('la CPU sólo devuelve movimientos legales para el terreno actual', () => {
    const blocked = ARENA_PRESETS[1].blocked;
    const legal = arenaLegalMoves(ARENA_START_FEN, blocked);
    const chosen = arenaChooseCpuMove(ARENA_START_FEN, blocked, { depth: 1, randomFn: () => 0 });
    expect(chosen).not.toBeNull();
    expect(legal.some((move) => move.from === chosen.from && move.to === chosen.to)).toBe(true);
  });
});
