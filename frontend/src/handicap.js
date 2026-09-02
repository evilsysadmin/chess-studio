// handicap.js — Hándicap de material clásico ("odds").
//
// Importante: el hándicap es una regla que cambia la posición inicial, no una
// consecuencia silenciosa de elegir una CPU fuerte. Durante un tiempo se
// aplicó automáticamente cuando la dificultad manual quedaba muy por encima
// del rating del jugador; eso hacía que una pieza de la CPU pareciera haber
// desaparecido del tablero. Desde v19 el cálculo es opt-in: los modos normales
// conservan siempre el material estándar 16 vs 16 salvo que un modo active
// explícitamente esta regla.

import { difficultyForRating, PROVISIONAL_GAMES } from './playerRating.js';

// Umbrales de brecha (dificultad elegida menos tu dificultad "justa"
// según rating). Sólo se consultan cuando el modo llama con enabled=true.
const HANDICAP_LEVELS = [
  { gap: 15, id: 'pawn', label: 'Sin un peón' },
  { gap: 30, id: 'knight', label: 'Sin un caballo' },
  { gap: 50, id: 'rook', label: 'Sin una torre' },
  { gap: 70, id: 'queen', label: 'Sin la dama' },
];

// Devuelve { id, label } del hándicap recomendado o null.
// Por defecto está desactivado: una partida normal nunca pierde material por
// seleccionar una dificultad alta. Un modo que quiera odds clásicos debe
// pedirlos de forma explícita con { enabled: true }.
export function handicapForGap(playerRating, cpuDifficulty, { enabled = false } = {}) {
  if (!enabled) return null;

  const fairDifficulty = difficultyForRating(playerRating, [], PROVISIONAL_GAMES);
  const gap = cpuDifficulty - fairDifficulty;

  let chosen = null;
  for (const level of HANDICAP_LEVELS) {
    if (gap >= level.gap) chosen = level;
  }
  return chosen ? { id: chosen.id, label: chosen.label } : null;
}
