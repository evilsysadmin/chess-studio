import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { applySuggestedOrLegalFallback, replayFenPositions, safeChessMove, standardChessStatus } from './chessRules.js';

describe('contrato común de reglas de ajedrez', () => {
  it('rechaza mover una pieza clavada dejando al rey en jaque', () => {
    const board = new Chess('4r1k1/8/8/8/8/8/4R3/4K3 w - - 0 1');
    expect(safeChessMove(board, { from: 'e2', to: 'd2' })).toBeNull();
    expect(board.fen()).toContain(' w ');
  });

  it('no permite enrocar atravesando una casilla atacada', () => {
    const board = new Chess('4k3/8/8/8/2b5/8/8/4K2R w K - 0 1');
    expect(safeChessMove(board, { from: 'e1', to: 'g1' })).toBeNull();
  });

  it('captura al paso existe sólo en la ventana legal inmediata', () => {
    const board = new Chess('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
    const ep = safeChessMove(board, { from: 'e5', to: 'd6' });
    expect(ep?.flags).toContain('e');

    const expired = new Chess('4k3/8/8/3pP3/8/8/8/4K3 w - - 0 1');
    expect(safeChessMove(expired, { from: 'e5', to: 'd6' })).toBeNull();
  });

  it('acepta las cuatro promociones legales', () => {
    for (const promotion of ['q', 'r', 'b', 'n']) {
      const board = new Chess('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
      expect(safeChessMove(board, { from: 'a7', to: 'a8', promotion })?.promotion).toBe(promotion);
    }
  });

  it('reproduce una subpromoción guardada sin convertirla en dama', () => {
    const initialFen = '4k3/P7/8/8/8/8/8/4K3 w - - 0 1';
    const rebuilt = replayFenPositions([{ from: 'a7', to: 'a8', promotion: 'n', san: 'a8=N' }], initialFen);
    expect(rebuilt.complete).toBe(true);
    const final = new Chess(rebuilt.positions.at(-1));
    expect(final.get('a8')?.type).toBe('n');
    expect(final.get('a8')?.color).toBe('w');
  });

  it('un historial corrupto se corta en la última posición válida sin lanzar', () => {
    const rebuilt = replayFenPositions([{ from: 'e2', to: 'e4' }, { from: 'e7', to: 'e3' }]);
    expect(rebuilt.complete).toBe(false);
    expect(rebuilt.failedAt).toBe(1);
    expect(rebuilt.positions).toHaveLength(2);
  });

  it('distingue jaque, mate y ahogado', () => {
    expect(standardChessStatus(new Chess('4Q2k/8/8/8/8/8/8/7K b - - 0 1'))).toBe('check');
    expect(standardChessStatus(new Chess('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1'))).toBe('checkmate');
    expect(standardChessStatus(new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'))).toBe('stalemate');
  });

  it('una sugerencia remota ilegal nunca entra: cae a una jugada local legal', () => {
    const board = new Chess();
    const { move, usedFallback } = applySuggestedOrLegalFallback(board, { from: 'e2', to: 'e5' }, () => 0);
    expect(usedFallback).toBe(true);
    expect(move).not.toBeNull();
    expect(board.history()).toHaveLength(1);
  });
});

describe('matriz exhaustiva de reglas especiales', () => {
  it('permite enroque cuando toda la ruta es legal y mueve también la torre', () => {
    const board = new Chess('4k3/8/8/8/8/8/8/4K2R w K - 0 1');
    const move = safeChessMove(board, { from: 'e1', to: 'g1' });
    expect(move?.san).toBe('O-O');
    expect(board.get('g1')?.type).toBe('k');
    expect(board.get('f1')?.type).toBe('r');
  });

  it('reconoce repetición, regla de 50 movimientos y material insuficiente como tablas', () => {
    const repetition = new Chess();
    for (const move of ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']) repetition.move(move);
    expect(standardChessStatus(repetition)).toBe('repetition');

    const fifty = new Chess('8/8/8/8/8/2k5/4K3/5R2 w - - 100 51');
    expect(standardChessStatus(fifty)).toBe('draw');

    const insufficient = new Chess('8/8/8/8/8/2k5/4K3/5B2 w - - 0 1');
    expect(standardChessStatus(insufficient)).toBe('draw');
  });

  it('una posición terminada no admite una jugada posterior ni fallback inventado', () => {
    const mate = new Chess('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1');
    expect(safeChessMove(mate, { from: 'h8', to: 'h7' })).toBeNull();
    expect(applySuggestedOrLegalFallback(mate, { from: 'h8', to: 'h7' }).move).toBeNull();
    expect(mate.fen()).toBe('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1');
  });

  it('fuzz determinista: una muestra amplia de partidas legales nunca corrompe el tablero', () => {
    let state = 0x46e;
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 0x100000000;
    };
    let appliedPlies = 0;
    for (let game = 0; game < 8; game += 1) {
      const board = new Chess();
      for (let ply = 0; ply < 60 && !board.isGameOver(); ply += 1) {
        const legal = board.moves({ verbose: true });
        const selected = legal[Math.floor(random() * legal.length)];
        const applied = safeChessMove(board, selected);
        expect(applied).not.toBeNull();
        expect(applied).toMatchObject({ from: selected.from, to: selected.to });
        expect(() => new Chess(board.fen())).not.toThrow();
        appliedPlies += 1;
      }
      if (board.isGameOver()) {
        expect(applySuggestedOrLegalFallback(board, { from: 'a1', to: 'a8' }, random).move).toBeNull();
      }
    }
    expect(appliedPlies).toBeGreaterThan(250);
  });
});
