import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import {
  hitChance,
  statsFor,
  costForNextPoint,
  buyStatPoint,
  autoLevelUp,
  applyMoveToRegistry,
  capturedSquareFor,
  passTurnFen,
  resolveCombatMove,
  rosterKeyFor,
} from './combat.js';

function mkPiece(type, overrides = {}) {
  return {
    id: `w-${type}-a1`,
    type,
    color: 'w',
    square: 'a1',
    strengthPoints: 0,
    speedPoints: 0,
    bankedXp: 0,
    ...overrides,
  };
}

describe('hitChance', () => {
  it('da exactamente 50% entre dos piezas idénticas (mismo tipo, mismos puntos)', () => {
    // Ninguna en su casilla de partida, para que el bono de "en reserva" no distorsione la comparación.
    const a = mkPiece('p', { id: 'w-p-e2', square: 'e4' });
    const b = mkPiece('p', { id: 'b-p-d7', color: 'b', square: 'd5' });
    expect(hitChance(a, b)).toBeCloseTo(0.5, 5);
  });

  it('nunca baja de 20% aunque el rival esté muy subido de nivel', () => {
    const weak = mkPiece('p');
    const strong = mkPiece('q', { strengthPoints: 20, speedPoints: 20 });
    expect(hitChance(weak, strong)).toBeGreaterThanOrEqual(0.2);
  });

  it('nunca supera el 90%', () => {
    const strong = mkPiece('q', { strengthPoints: 20, speedPoints: 20 });
    const weak = mkPiece('p');
    expect(hitChance(strong, weak)).toBeLessThanOrEqual(0.9);
  });

  it('el rey siempre acierta cuando ataca, sin importar contra quién', () => {
    const king = mkPiece('k');
    const superQueen = mkPiece('q', { strengthPoints: 50, speedPoints: 50, color: 'b' });
    expect(hitChance(king, superQueen)).toBe(1);
  });

  it('el rey nunca esquiva (siempre 100% en contra si fuera defensor)', () => {
    const attacker = mkPiece('p');
    const king = mkPiece('k', { color: 'b' });
    expect(hitChance(attacker, king)).toBe(1);
  });

  it('da bono por atacar desde la casilla de partida', () => {
    const home = mkPiece('p', { square: 'e2', id: 'w-p-e2' });
    const moved = mkPiece('p', { square: 'e5', id: 'w-p-e2' });
    const defender = mkPiece('p', { color: 'b', square: 'd6' });
    expect(hitChance(home, defender)).toBeGreaterThan(hitChance(moved, defender));
  });

  it('el bono por fuego concentrado sube con cada intento, con tope', () => {
    const attacker = mkPiece('p', { square: 'e5', id: 'w-p-e2' }); // ya movida, sin bono de casa
    const defender = mkPiece('p', { color: 'b', square: 'd6' });
    const base = hitChance(attacker, defender, 0);
    const streak2 = hitChance(attacker, defender, 2);
    const streak10 = hitChance(attacker, defender, 10);
    const streak5 = hitChance(attacker, defender, 5);
    expect(streak2).toBeGreaterThan(base);
    expect(streak10).toBe(streak5); // tope en 5 stacks, no sigue creciendo
  });
});

describe('costForNextPoint / buyStatPoint', () => {
  it('el coste escala 1, 2, 3... por cada punto ya comprado', () => {
    expect(costForNextPoint(0)).toBe(1);
    expect(costForNextPoint(1)).toBe(2);
    expect(costForNextPoint(4)).toBe(5);
  });

  it('fuerza y velocidad tienen contadores de coste independientes', () => {
    let piece = mkPiece('n', { bankedXp: 100 });
    piece = buyStatPoint(piece, 'strength');
    piece = buyStatPoint(piece, 'strength');
    // el 3er punto de fuerza deberia costar 3, pero el 1er punto de velocidad sigue costando 1
    expect(costForNextPoint(piece.strengthPoints)).toBe(3);
    expect(costForNextPoint(piece.speedPoints)).toBe(1);
  });

  it('no permite comprar si no alcanza el XP bancado', () => {
    const piece = mkPiece('p', { bankedXp: 0 });
    expect(buyStatPoint(piece, 'strength')).toBeNull();
  });

  it('la vista previa de stats coincide con el resultado real de comprar', () => {
    const piece = mkPiece('n', { strengthPoints: 2, bankedXp: 5 });
    const before = statsFor(piece);
    const after = statsFor(buyStatPoint(piece, 'strength'));
    expect(after.strength).toBeGreaterThan(before.strength);
  });
});

describe('autoLevelUp', () => {
  it('compra fuerza y velocidad en pareja mientras alcance para ambas', () => {
    const piece = mkPiece('n', { bankedXp: 20 });
    const leveled = autoLevelUp(piece);
    // par1=1+1=2, par2=2+2=4, par3=3+3=6, par4=4+4=8 -> total 20, 4 pares
    expect(leveled.strengthPoints).toBe(4);
    expect(leveled.speedPoints).toBe(4);
    expect(leveled.bankedXp).toBe(0);
  });

  it('no gasta más de lo que alcanza para un par completo', () => {
    const piece = mkPiece('n', { bankedXp: 3 }); // alcanza para 1 par (costo 2), sobran 1
    const leveled = autoLevelUp(piece);
    expect(leveled.strengthPoints).toBe(1);
    expect(leveled.speedPoints).toBe(1);
    expect(leveled.bankedXp).toBe(1);
  });
});

describe('rosterKeyFor', () => {
  it('es independiente del color: mismo tipo+columna da la misma clave', () => {
    const white = mkPiece('n', { id: 'w-n-b1' });
    const black = mkPiece('n', { id: 'b-n-b8' });
    expect(rosterKeyFor(white)).toBe(rosterKeyFor(black));
    expect(rosterKeyFor(white)).toBe('n-b');
  });
});

describe('applyMoveToRegistry — casos especiales', () => {
  it('el enroque mueve también la torre en el registro (no la deja fantasma)', () => {
    const chess = new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    const testRegistry = {
      e1: { id: 'w-k-e1', type: 'k', color: 'w', square: 'e1', strengthPoints: 0, speedPoints: 0, bankedXp: 0 },
      h1: { id: 'w-r-h1', type: 'r', color: 'w', square: 'h1', strengthPoints: 0, speedPoints: 0, bankedXp: 0 },
    };
    const applied = chess.move('O-O');
    const { registry: next } = applyMoveToRegistry(testRegistry, applied);
    expect(next.h1).toBeUndefined();
    expect(next.f1).toBeDefined();
    expect(next.f1.type).toBe('r');
    expect(next.g1).toBeDefined();
    expect(next.g1.type).toBe('k');
  });

  it('la captura al paso identifica correctamente la casilla real de la pieza capturada', () => {
    const chess = new Chess();
    chess.move('e4'); chess.move('a6'); chess.move('e5'); chess.move('d5');
    const applied = chess.move('exd6'); // al paso
    expect(applied.flags).toContain('e');
    expect(capturedSquareFor(applied)).toBe('d5'); // NO es 'd6' (el destino), es donde estaba el peón
  });

  it('la coronación cambia el tipo de la pieza en el registro, conservando XP', () => {
    const chess = new Chess('8/P7/8/8/8/8/8/k6K w - - 0 1');
    const registry = {
      a7: { id: 'w-p-a2', type: 'p', color: 'w', square: 'a7', strengthPoints: 1, speedPoints: 1, bankedXp: 3 },
    };
    const applied = chess.move('a8=Q');
    const { registry: next } = applyMoveToRegistry(registry, applied);
    expect(next.a8.type).toBe('q');
    expect(next.a8.strengthPoints).toBe(1); // conserva lo comprado
  });
});

describe('resolveCombatMove — reglas de integridad del ajedrez', () => {
  it('si quien mueve está en jaque, la jugada que lo resuelve SIEMPRE acierta', () => {
    const fen = '7k/8/8/8/8/8/r7/K7 w - - 0 1'; // torre negra en a2 da jaque, unica salida es Kxa2
    const registry = {
      a1: mkPiece('k', { id: 'w-k-a1', square: 'a1' }),
      a2: mkPiece('r', { id: 'b-r-a2', color: 'b', square: 'a2', strengthPoints: 20, speedPoints: 20 }),
      h8: mkPiece('k', { id: 'b-k-h8', color: 'b', square: 'h8' }),
    };
    for (let i = 0; i < 20; i++) {
      const result = resolveCombatMove({ fen, registry, from: 'a1', to: 'a2', focusStreak: 0 });
      expect(result.hit).toBe(true);
    }
  });

  it('un esquive nunca deja al rival en una posición sin jugadas (ahogado fantasma)', () => {
    // Posicion construida y verificada: rey negro h8 acorralado por Kf7+Qg6,
    // caballo negro a8 congelado por sus propios peones b6/c7 (bloqueados
    // por peones blancos b5/c6). Si el esquive de Rxa8 se aplicara normal
    // (solo pasando el turno), negras quedaria sin ninguna jugada legal.
    const fen = 'n6k/2p2K2/1pP3Q1/1P6/8/8/8/R7 w - - 0 1';
    const registry = {
      h8: mkPiece('k', { id: 'b-k-h8', color: 'b', square: 'h8' }),
      a8: mkPiece('n', { id: 'b-n-a8', color: 'b', square: 'a8', strengthPoints: 20, speedPoints: 20 }),
      b6: mkPiece('p', { id: 'b-p-b6', color: 'b', square: 'b6' }),
      c7: mkPiece('p', { id: 'b-p-c7', color: 'b', square: 'c7' }),
      f7: mkPiece('k', { id: 'w-k-f7', square: 'f7' }),
      g6: mkPiece('q', { id: 'w-q-g6', square: 'g6' }),
      a1: mkPiece('r', { id: 'w-r-a1', square: 'a1' }),
      b5: mkPiece('p', { id: 'w-p-b5', square: 'b5' }),
      c6: mkPiece('p', { id: 'w-p-c6', square: 'c6' }),
    };
    for (let i = 0; i < 20; i++) {
      const result = resolveCombatMove({ fen, registry, from: 'a1', to: 'a8', focusStreak: 0 });
      expect(result.hit).toBe(true); // se fuerza el acierto para no generar el ahogado
    }
  });

  it('una captura exitosa banca XP en el atacante', () => {
    const chess = new Chess();
    chess.move('e4'); chess.move('d5');
    const fen = chess.fen();
    // El registro tiene que reflejar las piezas en sus casillas ACTUALES
    // (tras e4 d5), no la posición inicial — si no, el atacante no existe
    // en `registry[from]`.
    const registry = {
      e4: { id: 'w-p-e2', type: 'p', color: 'w', square: 'e4', strengthPoints: 0, speedPoints: 0, bankedXp: 0 },
      d5: { id: 'b-p-d7', type: 'p', color: 'b', square: 'd5', strengthPoints: 0, speedPoints: 0, bankedXp: 0 },
    };
    const originalRandom = Math.random;
    Math.random = () => 0; // fuerza acierto
    const result = resolveCombatMove({ fen, registry, from: 'e4', to: 'd5', promotion: 'q', focusStreak: 0 });
    Math.random = originalRandom;

    expect(result.hit).toBe(true);
    expect(result.registry.d5.bankedXp).toBe(1); // valor de un peón
  });

  it('un esquive banca XP de supervivencia en el defensor y no mueve nada', () => {
    const chess = new Chess();
    chess.move('e4'); chess.move('d5');
    const fen = chess.fen();
    const registry = {
      e4: { id: 'w-p-e2', type: 'p', color: 'w', square: 'e4', strengthPoints: 0, speedPoints: 0, bankedXp: 0 },
      d5: { id: 'b-p-d7', type: 'p', color: 'b', square: 'd5', strengthPoints: 0, speedPoints: 0, bankedXp: 0 },
    };
    const originalRandom = Math.random;
    Math.random = () => 0.999; // fuerza fallo
    const result = resolveCombatMove({ fen, registry, from: 'e4', to: 'd5', promotion: 'q', focusStreak: 0 });
    Math.random = originalRandom;

    expect(result.hit).toBe(false);
    expect(result.registry.d5.bankedXp).toBeGreaterThan(0);
    const afterChess = new Chess(result.fen);
    expect(afterChess.get('e4')).toBeTruthy(); // el movimiento NO se aplicó
  });
});

describe('el rey nunca participa del sistema de niveles', () => {
  it('capturar con el rey no banca XP', () => {
    const fen = 'k7/8/8/8/8/8/1q6/K7 w - - 0 1';
    const registry = {
      a1: mkPiece('k', { id: 'w-k-a1', square: 'a1' }),
      b2: mkPiece('q', { id: 'b-q-b2', color: 'b', square: 'b2' }),
      a8: mkPiece('k', { id: 'b-k-a8', color: 'b', square: 'a8' }),
    };
    const result = resolveCombatMove({ fen, registry, from: 'a1', to: 'b2', focusStreak: 0 });
    expect(result.hit).toBe(true);
    expect(result.registry.b2.bankedXp).toBe(0);
  });

  it('buyStatPoint rechaza al rey aunque tenga XP bancado', () => {
    const king = mkPiece('k', { bankedXp: 999 });
    expect(buyStatPoint(king, 'strength')).toBeNull();
  });

  it('autoLevelUp no toca al rey aunque tenga XP bancado', () => {
    const king = mkPiece('k', { bankedXp: 999 });
    const result = autoLevelUp(king);
    expect(result).toBe(king); // mismo objeto, sin cambios
  });
});

describe('passTurnFen', () => {
  it('cambia el turno sin tocar el resto de la posición', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
    const flipped = passTurnFen(fen);
    const parts = flipped.split(' ');
    expect(parts[0]).toBe(fen.split(' ')[0]); // el tablero no cambia
    expect(parts[1]).toBe('w'); // el turno si
    expect(parts[3]).toBe('-'); // se limpia la captura al paso pendiente
  });
});
