// handicap.js — Hándicap de material dinámico: en vez de elegir la
// dificultad de la CPU a mano sin más contexto, esto calcula si hace
// falta compensar la brecha entre tu rating actual y la dificultad
// elegida sacándole una pieza a la CPU — convención clásica de ajedrez
// ("odds"), con siglos de uso, en vez de inventar un sistema de puntos
// nuevo. Reusa `difficultyForRating` (ya existe en playerRating.js) para
// traducir tu rating a un número 0-100 comparable con la dificultad.

import { difficultyForRating, PROVISIONAL_GAMES } from './playerRating.js';

// Umbrales de brecha (dificultad elegida menos tu dificultad "justa"
// según rating) — por debajo de HANDICAP_THRESHOLDS[0].gap no hay
// hándicap, la brecha es chica y no hace falta compensar nada.
const HANDICAP_LEVELS = [
  { gap: 15, id: 'pawn', label: 'Sin un peón' },
  { gap: 30, id: 'knight', label: 'Sin un caballo' },
  { gap: 50, id: 'rook', label: 'Sin una torre' },
  { gap: 70, id: 'queen', label: 'Sin la dama' },
];

// Devuelve { id, label } del hándicap que corresponde, o null si la
// brecha es chica y no hace falta ninguno. El hándicap compara contra la
// fuerza base que corresponde al ELO: el alivio provisional y la forma
// reciente sirven para elegir la próxima CPU automática, no para convertir
// una selección manual en un hándicap distinto según el estado local actual.
export function handicapForGap(playerRating, cpuDifficulty) {
  const fairDifficulty = difficultyForRating(playerRating, [], PROVISIONAL_GAMES);
  const gap = cpuDifficulty - fairDifficulty;

  let chosen = null;
  for (const level of HANDICAP_LEVELS) {
    if (gap >= level.gap) chosen = level;
  }
  return chosen ? { id: chosen.id, label: chosen.label } : null;
}
