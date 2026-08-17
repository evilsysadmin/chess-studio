// roguelikeModifiers.js — Los "modificadores raros" del Combate roguelike:
// en vez de escalar la dificultad solo subiendo el nivel del motor, cada
// piso le suma material extra a la CPU sobre el tablero inicial estándar
// — con chess.js (`.put()`), del lado del cliente, sin tocar el backend
// para nada (Combate ya maneja su tablero 100% local, ver CombatScreen.jsx).

import { Chess } from 'chess.js';

export const ROGUELIKE_MODIFIERS = [
  { id: 'none', label: 'Sin modificador', description: 'Material estándar de los dos lados.' },
  { id: 'extra_knight', label: 'Caballo extra', description: 'La CPU empieza con un caballo de más.' },
  { id: 'extra_bishop', label: 'Alfil extra', description: 'La CPU empieza con un alfil de más.' },
  { id: 'extra_rook', label: 'Torre extra', description: 'La CPU empieza con una torre de más.' },
  { id: 'double_pawns', label: 'Doble peonaje', description: 'La CPU empieza con el doble de peones (16 en vez de 8).' },
  { id: 'extra_queen', label: 'Dama extra', description: 'La CPU empieza con dos damas.' },
];

// Casillas vacías del lado de la CPU en la posición inicial estándar —
// fila "de desarrollo" (3 para blancas, 6 para negras), lejos de
// pisar ninguna pieza existente.
function developmentSquare(file, cpuColor) {
  const rank = cpuColor === 'w' ? '3' : '6';
  return `${file}${rank}`;
}

function pawnRank(cpuColor) {
  return cpuColor === 'w' ? '4' : '5'; // una fila más avanzada que los peones normales, también vacía siempre
}

export function applyModifierToFen(baseFen, modifierId, cpuColor) {
  if (!modifierId || modifierId === 'none') return baseFen;

  const chess = new Chess(baseFen);

  switch (modifierId) {
    case 'extra_knight':
      chess.put({ type: 'n', color: cpuColor }, developmentSquare('c', cpuColor));
      break;
    case 'extra_bishop':
      chess.put({ type: 'b', color: cpuColor }, developmentSquare('d', cpuColor));
      break;
    case 'extra_rook':
      chess.put({ type: 'r', color: cpuColor }, developmentSquare('e', cpuColor));
      break;
    case 'extra_queen':
      chess.put({ type: 'q', color: cpuColor }, developmentSquare('d', cpuColor));
      break;
    case 'double_pawns': {
      const rank = pawnRank(cpuColor);
      for (const file of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
        chess.put({ type: 'p', color: cpuColor }, `${file}${rank}`);
      }
      break;
    }
    default:
      break;
  }

  return chess.fen();
}

// El piso determina qué tan probable/severo es el modificador — pisos
// bajos casi siempre "none" o algo chico, pisos altos casi siempre algo
// grande. No es puramente aleatorio: más piso, más probable lo grave.
export function modifierForFloor(floor) {
  const weights =
    floor <= 2
      ? { none: 3, extra_knight: 1, extra_bishop: 1 }
      : floor <= 5
        ? { extra_knight: 2, extra_bishop: 2, extra_rook: 1, double_pawns: 1 }
        : floor <= 8
          ? { extra_rook: 2, double_pawns: 2, extra_bishop: 1, extra_queen: 1 }
          : { double_pawns: 2, extra_queen: 2, extra_rook: 1 };

  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = Math.random() * total;
  for (const [id, w] of entries) {
    if (roll < w) return ROGUELIKE_MODIFIERS.find((m) => m.id === id);
    roll -= w;
  }
  return ROGUELIKE_MODIFIERS[0]; // no debería llegar acá nunca, pero por las dudas
}
