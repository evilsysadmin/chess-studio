import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import { PUZZLES, randomPuzzle } from './puzzles.js';

function findAllMatesIn1(fen) {
  const c = new Chess(fen);
  const mates = [];
  for (const move of c.moves({ verbose: true })) {
    const c2 = new Chess(fen);
    c2.move(move.san);
    if (c2.isCheckmate()) mates.push(move.san);
  }
  return mates;
}

describe('PUZZLES — validación estructural básica', () => {
  it('todos los ids son únicos', () => {
    const ids = PUZZLES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('todos los FEN cargan sin errores', () => {
    for (const p of PUZZLES) {
      expect(() => new Chess(p.fen), `${p.id}: FEN inválido`).not.toThrow();
    }
  });

  it('toda la secuencia de solution es legal desde el FEN inicial', () => {
    for (const p of PUZZLES) {
      const c = new Chess(p.fen);
      for (const san of p.solution) {
        const move = c.move(san);
        expect(move, `${p.id}: la jugada "${san}" no es legal en ese punto`).not.toBeNull();
      }
    }
  });
});

describe('PUZZLES — jaque mate/captura real al final de la solución', () => {
  it('los puzzles "mate1"/"mate2" terminan en jaque mate de verdad', () => {
    for (const p of PUZZLES.filter((p) => p.kind === 'mate1' || p.kind === 'mate2')) {
      const c = new Chess(p.fen);
      for (const san of p.solution) c.move(san);
      expect(c.isCheckmate(), `${p.id}: la posición final no es jaque mate`).toBe(true);
    }
  });

  it('los puzzles "material" terminan en una captura', () => {
    for (const p of PUZZLES.filter((p) => p.kind === 'material')) {
      const c = new Chess(p.fen);
      let lastMove = null;
      for (const san of p.solution) lastMove = c.move(san);
      expect(lastMove.captured, `${p.id}: la última jugada de la solución no captura nada`).toBeTruthy();
    }
  });
});

describe('PUZZLES — respuestas del rival son de verdad forzadas', () => {
  it('en mate1/mate2, cada índice impar de solution (la respuesta que aplica el propio modo puzzle automáticamente) era la ÚNICA jugada legal disponible', () => {
    // Solo aplica a mate1/mate2 -- en los de "gana material" (horquilla), el
    // punto es que CUALQUIER respuesta del rival sigue perdiendo la pieza,
    // no que haya una única respuesta forzada. Forzar esa propiedad ahí
    // sería un requisito que no tiene sentido para ese tipo de puzzle.
    for (const p of PUZZLES.filter((p) => p.kind === 'mate1' || p.kind === 'mate2')) {
      const c = new Chess(p.fen);
      for (let i = 0; i < p.solution.length; i++) {
        if (i % 2 === 1) {
          const legalCount = c.moves().length;
          expect(legalCount, `${p.id}, paso ${i} ("${p.solution[i]}"): había ${legalCount} respuestas legales, no era una jugada forzada`).toBe(1);
        }
        c.move(p.solution[i]);
      }
    }
  });
});

describe('PUZZLES — sin mate más corto que el pedido (el bug real que motivó este archivo)', () => {
  // Un jugador que encuentre un mate más corto y VÁLIDO que el guardado en
  // `solution` se lleva un "está mal" del validador del modo puzzle, que
  // solo compara contra la secuencia exacta acá adentro. Este test existe
  // porque los 3 puzzles de "mate en 2" originales tenían este problema —
  // los tres tenían mate en 1 disponible desde el arranque sin que nadie
  // lo hubiera detectado, hasta que un usuario jugó Qa7# en una posición
  // donde la solución "oficial" pedía 3 jugadas.
  it('los puzzles "mate2" no tienen ningún mate en 1 disponible en la posición inicial', () => {
    for (const p of PUZZLES.filter((p) => p.kind === 'mate2')) {
      const matesIn1 = findAllMatesIn1(p.fen);
      expect(matesIn1, `${p.id}: hay mate en 1 (${matesIn1.join(', ')}) en una posición que se supone pide 2 jugadas`).toHaveLength(0);
    }
  });

  it('los puzzles "mate1" no tienen ninguna OTRA jugada que también dé mate (la solución debería ser la única)', () => {
    for (const p of PUZZLES.filter((p) => p.kind === 'mate1')) {
      const matesIn1 = findAllMatesIn1(p.fen);
      const extras = matesIn1.filter((san) => san !== p.solution[0]);
      expect(extras, `${p.id}: hay otra(s) jugada(s) que también dan mate (${extras.join(', ')}), la solución no es única`).toHaveLength(0);
    }
  });
});

describe('randomPuzzle', () => {
  it('siempre devuelve un puzzle real del banco', () => {
    for (let i = 0; i < 20; i++) {
      const p = randomPuzzle();
      expect(PUZZLES).toContainEqual(p);
    }
  });

  it('con excludeId, nunca devuelve ese puzzle puntual (salvo que sea el único que queda)', () => {
    const excludeId = PUZZLES[0].id;
    for (let i = 0; i < 20; i++) {
      const p = randomPuzzle(excludeId);
      expect(p.id).not.toBe(excludeId);
    }
  });
});
