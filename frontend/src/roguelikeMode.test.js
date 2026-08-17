import { describe, it, expect, beforeEach } from 'vitest';
import { Chess } from 'chess.js';
import { ROGUELIKE_MODIFIERS, applyModifierToFen, modifierForFloor } from './roguelikeModifiers.js';
import {
  loadRun,
  startNewRun,
  advanceFloor,
  endRun,
  loadBestFloor,
  resetRoguelikeRun,
  difficultyForFloor,
} from './roguelikeRun.js';

beforeEach(() => localStorage.clear());

describe('applyModifierToFen', () => {
  const baseFen = new Chess().fen();

  it('"none" no cambia el FEN', () => {
    expect(applyModifierToFen(baseFen, 'none', 'b')).toBe(baseFen);
  });

  it('cada modificador produce un FEN válido, verificado con chess.js real', () => {
    for (const mod of ROGUELIKE_MODIFIERS) {
      const fen = applyModifierToFen(baseFen, mod.id, 'b');
      expect(() => new Chess(fen)).not.toThrow();
    }
  });

  it('extra_queen le da a la CPU dos damas en vez de una', () => {
    const fen = applyModifierToFen(baseFen, 'extra_queen', 'b');
    const board = new Chess(fen).board();
    const blackQueens = board.flat().filter((p) => p && p.type === 'q' && p.color === 'b');
    expect(blackQueens).toHaveLength(2);
  });

  it('double_pawns le da a la CPU 16 peones en vez de 8', () => {
    const fen = applyModifierToFen(baseFen, 'double_pawns', 'b');
    const board = new Chess(fen).board();
    const blackPawns = board.flat().filter((p) => p && p.type === 'p' && p.color === 'b');
    expect(blackPawns).toHaveLength(16);
  });

  it('el modificador solo afecta a la CPU, nunca al humano', () => {
    const fenParaCpuNegras = applyModifierToFen(baseFen, 'extra_queen', 'b');
    const board = new Chess(fenParaCpuNegras).board();
    const whiteQueens = board.flat().filter((p) => p && p.type === 'q' && p.color === 'w');
    expect(whiteQueens).toHaveLength(1); // las blancas (humano) siguen con una sola dama
  });

  it('funciona igual de bien con la CPU jugando blancas', () => {
    const fen = applyModifierToFen(baseFen, 'extra_rook', 'w');
    const board = new Chess(fen).board();
    const whiteRooks = board.flat().filter((p) => p && p.type === 'r' && p.color === 'w');
    expect(whiteRooks).toHaveLength(3);
  });
});

describe('modifierForFloor', () => {
  it('siempre devuelve un modificador válido de la lista', () => {
    const validIds = new Set(ROGUELIKE_MODIFIERS.map((m) => m.id));
    for (const floor of [1, 3, 5, 8, 12, 20]) {
      const m = modifierForFloor(floor);
      expect(validIds.has(m.id)).toBe(true);
    }
  });
});

describe('roguelikeRun', () => {
  it('arranca sin corrida en curso, piso 1', () => {
    const run = loadRun();
    expect(run.inRun).toBe(false);
    expect(run.floor).toBe(1);
  });

  it('startNewRun pone inRun en true, piso 1', () => {
    const run = startNewRun();
    expect(run.inRun).toBe(true);
    expect(run.floor).toBe(1);
  });

  it('advanceFloor sube el piso y mantiene inRun', () => {
    let run = startNewRun();
    run = advanceFloor(run);
    run = advanceFloor(run);
    expect(run.floor).toBe(3);
    expect(run.inRun).toBe(true);
  });

  it('endRun termina la corrida y actualiza la mejor marca si corresponde', () => {
    let run = startNewRun();
    run = advanceFloor(run); // piso 2
    run = advanceFloor(run); // piso 3
    const reached = endRun(run);
    expect(reached).toBe(3);
    expect(loadBestFloor()).toBe(3);
    expect(loadRun().inRun).toBe(false); // la corrida ya terminó
  });

  it('la mejor marca nunca baja, aunque una corrida nueva llegue más corto', () => {
    let run = startNewRun();
    run = advanceFloor(run);
    run = advanceFloor(run);
    run = advanceFloor(run); // piso 4
    endRun(run);
    expect(loadBestFloor()).toBe(4);

    run = startNewRun();
    run = advanceFloor(run); // piso 2, más corto que la vez pasada
    endRun(run);
    expect(loadBestFloor()).toBe(4); // se mantiene
  });

  it('resetRoguelikeRun borra la corrida en curso y la mejor marca', () => {
    let run = startNewRun();
    run = advanceFloor(run);
    endRun(run);
    expect(loadBestFloor()).toBeGreaterThan(0);

    resetRoguelikeRun();
    expect(loadBestFloor()).toBe(0);
    expect(loadRun().inRun).toBe(false);
  });
});

describe('difficultyForFloor', () => {
  it('sube con el piso, nunca supera 95', () => {
    expect(difficultyForFloor(1)).toBeLessThan(difficultyForFloor(5));
    expect(difficultyForFloor(20)).toBeLessThanOrEqual(95);
    expect(difficultyForFloor(100)).toBe(95); // tope, no sigue subiendo para siempre
  });
});
