// roguelikeModifiers.js — Encuentros del Combate Roguelike.
// Cada intento tiene seed persistente. Los pisos 1-9 son encuentros con
// identidad; el piso 10 es siempre el Rey Boss. Ya no existe un piso 1 que
// sea simplemente "partida normal" con una pegatina de roguelike.

import { Chess } from 'chess.js';
import { ROGUELIKE_BOSS, ROGUELIKE_BOSS_FLOOR } from './roguelikeBoss.js';

export const ROGUELIKE_MODIFIERS = [
  { id: 'none', label: 'Material estándar', description: 'Material estándar; se usa sólo cuando otra mecánica especial ya define el encuentro.' },
  { id: 'extra_knight', label: 'Caballo extra', description: 'La CPU empieza con un caballo de más.' },
  { id: 'extra_bishop', label: 'Alfil extra', description: 'La CPU empieza con un alfil de más.' },
  { id: 'extra_rook', label: 'Torre extra', description: 'La CPU empieza con una torre de más.' },
  { id: 'double_pawns', label: 'Doble peonaje', description: 'La CPU empieza con el doble de peones (16 en vez de 8).' },
  { id: 'extra_queen', label: 'Dama extra', description: 'La CPU empieza con dos damas.' },
];

const MODIFIER_BY_ID = Object.fromEntries(ROGUELIKE_MODIFIERS.map((modifier) => [modifier.id, modifier]));

function developmentSquare(file, cpuColor) {
  const rank = cpuColor === 'w' ? '3' : '6';
  return `${file}${rank}`;
}

function pawnRank(cpuColor) {
  return cpuColor === 'w' ? '4' : '5';
}

export function applyModifierToFen(baseFen, modifierId, cpuColor) {
  if (!modifierId || modifierId === 'none') return baseFen;
  const chess = new Chess(baseFen);
  switch (modifierId) {
    case 'extra_knight': chess.put({ type: 'n', color: cpuColor }, developmentSquare('c', cpuColor)); break;
    case 'extra_bishop': chess.put({ type: 'b', color: cpuColor }, developmentSquare('d', cpuColor)); break;
    case 'extra_rook': chess.put({ type: 'r', color: cpuColor }, developmentSquare('e', cpuColor)); break;
    case 'extra_queen': chess.put({ type: 'q', color: cpuColor }, developmentSquare('d', cpuColor)); break;
    case 'double_pawns': {
      const rank = pawnRank(cpuColor);
      for (const file of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) chess.put({ type: 'p', color: cpuColor }, `${file}${rank}`);
      break;
    }
    default: break;
  }
  return chess.fen();
}

function weightsForFloor(floor) {
  if (floor <= 3) return { extra_knight: 2, extra_bishop: 2 };
  if (floor <= 6) return { extra_knight: 1, extra_bishop: 1, extra_rook: 2, double_pawns: 1 };
  return { extra_rook: 2, double_pawns: 2, extra_queen: 1 };
}

export function modifierForFloor(floor, randomFn = Math.random) {
  const weights = weightsForFloor(Math.max(1, Number(floor) || 1));
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = Math.min(0.999999999, Math.max(0, Number(randomFn()) || 0)) * total;
  for (const [id, weight] of entries) {
    if (roll < weight) return MODIFIER_BY_ID[id] || ROGUELIKE_MODIFIERS[1];
    roll -= weight;
  }
  return ROGUELIKE_MODIFIERS[1];
}

export function seededUnit(seed, floor) {
  const text = `${String(seed ?? 'run')}:${Math.max(1, Number(floor) || 1)}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 0x100000000;
}

export function modifierForRun(seed, floor) {
  const f = Math.max(1, Number(floor) || 1);
  if (f === ROGUELIKE_BOSS_FLOOR) return MODIFIER_BY_ID.none;
  // Encuentros señalados: siempre tienen la misma identidad/material.
  if (f === 4) return MODIFIER_BY_ID.extra_rook;
  if (f === 5) return MODIFIER_BY_ID.extra_queen;
  if (f === 9) return MODIFIER_BY_ID.double_pawns;
  const roll = seededUnit(seed, f);
  return modifierForFloor(f, () => roll);
}

export function encounterForRun(seed, floor) {
  const f = Math.max(1, Number(floor) || 1);
  if (f === ROGUELIKE_BOSS_FLOOR) {
    return { ...ROGUELIKE_BOSS, modifierId: 'none', tier: 'boss', boss: true };
  }
  if (f === 4) return { id: 'fortress', label: 'La Fortaleza', description: 'Élite: una torre extra guarda el acceso a los pisos medios.', modifierId: 'extra_rook', tier: 'elite' };
  if (f === 5) return { id: 'usurer', label: 'El Usurero', description: 'Miniboss: llega con una segunda dama y ninguna intención de negociar.', modifierId: 'extra_queen', tier: 'miniboss' };
  if (f === 9) return { id: 'last_guard', label: 'La Guardia Final', description: 'Élite: una pared de dieciséis peones antes del rey.', modifierId: 'double_pawns', tier: 'elite' };
  const modifier = modifierForRun(seed, f);
  const prefix = f <= 3 ? 'Patrulla adelantada' : f <= 7 ? 'Mesa peligrosa' : 'Antesala del rey';
  return {
    id: `floor-${f}-${modifier.id}`,
    label: `${prefix} · ${modifier.label}`,
    description: modifier.description,
    modifierId: modifier.id,
    tier: 'normal',
    boss: false,
  };
}
