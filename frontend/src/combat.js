// combat.js — Motor de "Modo Combate": ajedrez normal + niveles y esquive.
//
// El jaque mate sigue siendo 100% determinista: se calcula con las reglas
// de ajedrez de siempre (chess.js, sin modificar). El esquive SOLO entra en
// juego en capturas normales — nunca decide si hay mate o no. El rey nunca
// esquiva porque, en la práctica, nunca llega a ser objetivo real de una
// captura: la partida termina en jaque mate antes de que eso pueda pasar.
//
// REGLA IMPORTANTE: si quien mueve está en jaque, la jugada que lo saca del
// jaque SIEMPRE conecta (no hay tirada). Si esa jugada fuera una captura y
// "fallara", el jaque quedaría sin resolver pero el turno pasaría igual —
// una posición inválida que rompe la partida. No puedes fallar tu propia
// salvación.
//
// EL XP ES UNA MONEDA, NO UN CONTADOR AUTOMÁTICO: capturar o sobrevivir un
// ataque banca experiencia en la pieza (`bankedXp`), pero no sube de nivel
// sola — hay que gastarla a propósito comprando puntos de fuerza o de
// velocidad para esa pieza en concreto (ver `buyStatPoint`). Cada punto
// cuesta más que el anterior, así que hay que elegir bien dónde invertir.

import { Chess } from 'chess.js';

export const BASE_STATS = {
  p: { strength: 1, speed: 8, name: 'Peón' },
  n: { strength: 3, speed: 30, name: 'Caballo' },
  b: { strength: 3, speed: 18, name: 'Alfil' },
  r: { strength: 5, speed: 6, name: 'Torre' },
  q: { strength: 9, speed: 20, name: 'Dama' },
  k: { strength: 4, speed: 12, name: 'Rey' },
};

// Cuánta experiencia banca capturar cada tipo de pieza.
export const PIECE_XP_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

// Cuánto suma cada punto comprado a la estadística real de la pieza.
export const STRENGTH_POINT_VALUE = 1.5;
export const SPEED_POINT_VALUE = 3;

// Bono de acierto por atacar sin haberte movido de tu casilla de partida —
// una pieza "en reserva" todavía sorprende. Compensa quedarte atrás en vez
// de desarrollar todo de entrada.
const HOME_SQUARE_BONUS = 0.12;

// Bono de acierto por fuego concentrado: cada ataque consecutivo contra el
// MISMO objetivo (sea que hayan acertado o fallado los anteriores) suma un
// poco más, hasta un tope.
const FOCUS_BONUS_PER_STACK = 0.04;
const FOCUS_MAX_STACKS = 5; // tope: +20%

// Cuánto cuesta el próximo punto de una estadística, dados los puntos que
// ya se compraron en ESA estadística para esa pieza. Escala 1, 2, 3, 4… —
// el primer punto es barato, después hay que elegir con cuidado.
export function costForNextPoint(currentPoints) {
  return (currentPoints || 0) + 1;
}

// Nivel derivado, solo para mostrar (insignia/aura en el tablero): la suma
// de todos los puntos comprados, sea en fuerza o en velocidad.
export function derivedLevel(piece) {
  return 1 + (piece.strengthPoints || 0) + (piece.speedPoints || 0);
}

// Convierte un nivel en un "escalón" visual: sin marca, bronce, plata u oro.
// Se usa tanto en el aura de las piezas sobre el tablero como en la
// pantalla de "tu ejército".
export function levelTier(level) {
  if (level >= 6) return 'gold';
  if (level >= 4) return 'silver';
  if (level >= 2) return 'bronze';
  return 'none';
}

// Stats reales de una pieza: la base de su tipo, más lo que se compró.
export function statsFor(piece) {
  const base = BASE_STATS[piece.type];
  return {
    strength: base.strength + (piece.strengthPoints || 0) * STRENGTH_POINT_VALUE,
    speed: base.speed + (piece.speedPoints || 0) * SPEED_POINT_VALUE,
  };
}

// Gasta XP bancado en un punto de fuerza o de velocidad para esta pieza.
// Devuelve la pieza actualizada, o null si no alcanza el XP.
export function buyStatPoint(piece, stat) {
  if (piece.type === 'k') return null; // el rey nunca gasta XP: no tiene, y no debería poder aunque la tuviera
  const key = stat === 'strength' ? 'strengthPoints' : 'speedPoints';
  const current = piece[key] || 0;
  const cost = costForNextPoint(current);
  if ((piece.bankedXp || 0) < cost) return null;
  return { ...piece, [key]: current + 1, bankedXp: piece.bankedXp - cost };
}

// Modo "auto-subida de nivel": en vez de elegir qué comprar a mano, gasta el
// XP bancado solo, comprando de a un punto de fuerza Y uno de velocidad
// juntos — así funcionaba el nivel antes de que existiera la compra manual.
// Sigue comprando mientras alcance para los dos a la vez; el resto queda
// bancado por si en algún momento se apaga el modo automático.
export function autoLevelUp(piece) {
  if (piece.type === 'k') return piece; // el rey nunca sube de nivel, ni siquiera automático
  let current = piece;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const pairCost = costForNextPoint(current.strengthPoints) + costForNextPoint(current.speedPoints);
    if ((current.bankedXp || 0) < pairCost) break;
    current = {
      ...current,
      strengthPoints: current.strengthPoints + 1,
      speedPoints: current.speedPoints + 1,
      bankedXp: current.bankedXp - pairCost,
    };
  }
  return current;
}

// "Poder de combate" de una pieza: combina fuerza y velocidad en un solo
// número. Se usa exactamente igual para el atacante y para el defensor —
// así, si dos piezas idénticas (mismos puntos comprados) se enfrentan, el
// resultado es 50/50 ni más ni menos, que es lo intuitivo.
function combatPower(piece) {
  const s = statsFor(piece);
  return s.strength * 1.2 + s.speed * 0.4;
}

// Probabilidad de que el ataque CONECTE (o sea, que la captura se concrete).
// Base: proporción entre el poder del atacante y el poder combinado de los
// dos (fórmula clásica de "precisión vs. evasión"). Encima se suman el bono
// por casilla de partida y el bono por fuego concentrado. Acotada entre 20%
// y 90%: nunca es un resultado garantizado, pero tampoco una apuesta casi
// imposible.
export function hitChance(attacker, defender, focusStreak = 0) {
  if (!defender || defender.type === 'k') return 1; // el rey nunca esquiva (y nunca debería llegar a ser el defensor real)
  if (attacker.type === 'k') return 1; // el rey también acierta siempre cuando ataca: rara vez lo hace, y es demasiado valioso para dejarlo a la suerte
  const a = combatPower(attacker);
  const d = combatPower(defender);
  let chance = a / (a + d);

  const startSquare = attacker.id ? attacker.id.split('-')[2] : null;
  if (startSquare && attacker.square === startSquare) {
    chance += HOME_SQUARE_BONUS;
  }

  if (focusStreak > 0) {
    chance += Math.min(focusStreak, FOCUS_MAX_STACKS) * FOCUS_BONUS_PER_STACK;
  }

  return Math.min(0.9, Math.max(0.2, chance));
}

// Construye el registro inicial de piezas (una entrada por cada una de las
// 32 piezas, con id estable basado en su casilla de partida) a partir de un
// tablero de chess.js recién creado.
export function createInitialRegistry(chess) {
  const registry = {};
  const board = chess.board();
  const files = 'abcdefgh';
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const piece = board[r][f];
      if (!piece) continue;
      const square = `${files[f]}${8 - r}`;
      const id = `${piece.color}-${piece.type}-${square}`;
      registry[square] = { id, type: piece.type, color: piece.color, square, strengthPoints: 0, speedPoints: 0, bankedXp: 0 };
    }
  }
  return registry;
}

// Identidad de una pieza para el progreso ENTRE partidas, sin depender del
// color: "tu caballo de dama" tiene que ser el mismo concepto sea que hoy
// juegues blancas o negras. Se arma con el tipo y la columna de su casilla
// de PARTIDA (que vive codificada en `id` y nunca cambia, aunque la pieza
// se mueva) — cada lado tiene exactamente una pieza de cada combinación
// tipo+columna en la posición inicial, así que es un identificador único.
export function rosterKeyFor(piece) {
  const [, type, startSquare] = piece.id.split('-');
  return `${type}-${startSquare[0]}`;
}

// Los 16 "slots" fijos de un bando (tipo + columna de partida), en el orden
// natural del tablero: fila trasera, después los peones. Es la lista
// canónica que usan tanto la pantalla de "tu ejército" como el guardado del
// roster para saber qué piezas deberían existir.
export const CANONICAL_ROSTER_SLOTS = [
  { type: 'r', file: 'a' }, { type: 'n', file: 'b' }, { type: 'b', file: 'c' }, { type: 'q', file: 'd' },
  { type: 'k', file: 'e' }, { type: 'b', file: 'f' }, { type: 'n', file: 'g' }, { type: 'r', file: 'h' },
  ...'abcdefgh'.split('').map((f) => ({ type: 'p', file: f })),
];

export function rosterSlotKey(slot) {
  return `${slot.type}-${slot.file}`;
}

// Coste en XP de COMBATE (la moneda del ejército, distinta del XP de cada
// pieza) para revivir una pieza caída. Cuanto más vale la pieza, más
// cuesta traerla de vuelta. El rey nunca aparece acá: nunca llega a
// "morir" en este sentido, la partida termina en jaque mate antes.
export function reviveCost(type) {
  const costs = { p: 8, n: 15, b: 15, r: 20, q: 30 };
  return costs[type] || 10;
}

// La casilla real donde vive la pieza que se captura con esta jugada. Para
// una captura normal es `to`; para "al paso" es la casilla detrás del peón
// que acaba de avanzar dos casillas (NUNCA es `to`, ese es un detalle fácil
// de pasar por alto y la causa de bugs feos si se ignora).
export function capturedSquareFor(applied) {
  if (applied.flags.includes('e')) {
    return `${applied.to[0]}${applied.from[1]}`;
  }
  return applied.to;
}

// Aplica el resultado de una jugada YA VALIDADA por chess.js al registro de
// piezas. Recibe el objeto de jugada "verbose" completo (no solo from/to)
// porque necesita sus flags para manejar bien los casos especiales:
//  - Al paso: la pieza capturada no está en `to`.
//  - Enroque: además del rey se mueve una torre, y si no se actualiza su
//    entrada del registro queda "fantasma" en su casilla vieja.
//  - Coronación: la pieza pasa a ser del tipo promovido para el combate,
//    conservando los puntos/XP que ya se habían acumulado.
export function applyMoveToRegistry(registry, applied) {
  const { from, to, flags, color, promotion } = applied;
  const next = { ...registry };
  const mover = next[from];
  if (!mover) return { registry: next };

  const isCapture = flags.includes('c') || flags.includes('e');
  const capturedSquare = isCapture ? capturedSquareFor(applied) : null;
  const capturedPiece = capturedSquare ? next[capturedSquare] : null;

  delete next[from];
  if (capturedSquare) delete next[capturedSquare];

  let updated = { ...mover, square: to };

  if (flags.includes('p') && promotion) {
    updated = { ...updated, type: promotion };
  }

  if (capturedPiece && updated.type !== 'k') {
    // El rey nunca banca XP: sigue las reglas normales de ajedrez, jaque y
    // jaque mate estándar, sin subir de nivel ni comprar stats. Cualquier
    // otra pieza sí banca lo que corresponda por la captura.
    const gained = PIECE_XP_VALUE[capturedPiece.type] || 0;
    updated = { ...updated, bankedXp: (updated.bankedXp || 0) + gained };
  }

  next[to] = updated;

  // Enroque: mover también la torre correspondiente en el registro.
  if (flags.includes('k') || flags.includes('q')) {
    const rank = color === 'w' ? '1' : '8';
    const rookFrom = flags.includes('k') ? `h${rank}` : `a${rank}`;
    const rookTo = flags.includes('k') ? `f${rank}` : `d${rank}`;
    const rook = next[rookFrom];
    if (rook) {
      delete next[rookFrom];
      next[rookTo] = { ...rook, square: rookTo };
    }
  }

  return { registry: next };
}

// Banca XP en una pieza que ya está en el tablero (por ejemplo, por
// sobrevivir a un ataque esquivándolo) sin moverla de casilla.
export function applySurvivalXp(registry, square, gained) {
  const piece = registry[square];
  if (!piece || gained <= 0 || piece.type === 'k') return { registry }; // el rey nunca banca XP, ni siquiera por sobrevivir
  const next = { ...registry, [square]: { ...piece, bankedXp: (piece.bankedXp || 0) + gained } };
  return { registry: next };
}

// Cambia de turno sin mover ninguna pieza (para cuando un ataque falla). Es
// una modificación directa del campo de turno en el FEN — no es una jugada
// de ajedrez "real", es la regla de la casa de este modo. Solo se usa
// cuando quien mueve NO estaba en jaque (ver resolveCombatMove).
export function passTurnFen(fen) {
  const parts = fen.split(' ');
  parts[1] = parts[1] === 'w' ? 'b' : 'w';
  parts[3] = '-'; // invalidamos captura al paso pendiente, por prolijidad
  return parts.join(' ');
}

// Resuelve una jugada completa (movimiento + combate si corresponde) de
// forma pura: no toca React ni ningún estado externo, solo recibe el FEN y
// el registro actuales y devuelve el resultado. La usan tanto el click del
// humano como el turno de la CPU, así el comportamiento es idéntico para
// los dos lados. `focusStreak` es cuántos ataques consecutivos ya se
// dirigieron contra este mismo objetivo (lo calcula quien llama, según su
// propio seguimiento de "a quién le vengo pegando").
export function resolveCombatMove({ fen, registry, from, to, promotion, focusStreak = 0 }) {
  const chess = new Chess();
  chess.load(fen);
  const attacker = registry[from];
  // Si quien mueve ya estaba en jaque, esta jugada tiene que resolverlo sí o
  // sí — nunca puede "fallar" (ver nota al principio del archivo).
  const mustSucceed = chess.inCheck();

  let applied;
  try {
    applied = chess.move({ from, to, promotion: promotion || 'q' });
  } catch (e) {
    applied = null;
  }
  if (!applied || !attacker) return null;

  const isCapture = applied.flags.includes('c') || applied.flags.includes('e');
  if (!isCapture) {
    const { registry: nextRegistry } = applyMoveToRegistry(registry, applied);
    return {
      fen: chess.fen(), registry: nextRegistry, isCapture: false, hit: null,
      chance: null, attacker, defender: null, survivalXp: 0, applied,
    };
  }

  const capturedSquare = capturedSquareFor(applied);
  const defender = registry[capturedSquare] || null;

  const chance = mustSucceed ? 1 : hitChance(attacker, defender, focusStreak);
  const hit = mustSucceed || Math.random() < chance;

  if (hit || !defender) {
    // Si por algún motivo no encontramos al defensor en el registro (no
    // debería pasar tras estos fixes, pero por robustez), aplicamos la
    // jugada igual sin tirada — mejor un golpe "gratis" que colgar la partida.
    const { registry: nextRegistry } = applyMoveToRegistry(registry, applied);
    return {
      fen: chess.fen(), registry: nextRegistry, isCapture: true, hit: true,
      chance, attacker, defender, survivalXp: 0, applied,
    };
  }

  // Antes de "gastar" el turno en un esquive, revisamos que no deje al
  // rival sin ninguna jugada legal (jaque mate o ahogado). Eso nunca podría
  // pasar en ajedrez de verdad — ahí un turno nunca se "pierde" sin que se
  // mueva nada, siempre cambia el tablero antes de pasarle el turno al
  // otro lado. Si el esquive dejara al rival congelado así, forzamos el
  // acierto en vez de dejar que la tirada decida el final de la partida
  // por una casualidad que el ajedrez normal nunca produciría.
  const passedFen = passTurnFen(fen);
  const afterMiss = new Chess();
  afterMiss.load(passedFen);
  if (afterMiss.isGameOver()) {
    const { registry: nextRegistry } = applyMoveToRegistry(registry, applied);
    return {
      fen: chess.fen(), registry: nextRegistry, isCapture: true, hit: true,
      chance, attacker, defender, survivalXp: 0, applied,
    };
  }

  // Esquive: NO se aplica el movimiento (solo pasa el turno), y la pieza
  // que esquivó banca algo de experiencia por sobrevivir — cuanto más
  // fuerte era el atacante del que se salvó, más vale la sobrevivida.
  const survivalXp = Math.max(1, Math.ceil((PIECE_XP_VALUE[attacker.type] || 1) / 2));
  const { registry: survivedRegistry } = applySurvivalXp(registry, capturedSquare, survivalXp);
  return {
    fen: passedFen, registry: survivedRegistry, isCapture: true, hit: false,
    chance, attacker, defender, survivalXp, applied,
  };
}
