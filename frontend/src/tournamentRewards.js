import { setProfileStorageItem, removeProfileStorageItem } from './profileKeys.js';

// tournamentRewards.js — Recompensas cosméticas por nivel de Torneo:
// títulos junto al nombre de nivel, y skins de color alternativas para
// las piezas. Se desbloquean solas al subir de nivel — no hace falta
// gastar puntos, es el mismo criterio que ya usa la dificultad de CPU
// ("jugar más te da más"). Los puntos/XP en sí se siguen gastando en
// pistas (ver `hintCost` en tournament.js) y en reintentos de puzzle
// (ver `puzzleStats.js`) — eso sí es gasto de un recurso consumible,
// esto es un desbloqueo permanente.

export const TITLES = [
  { level: 1, id: 'novato', label: 'Novato' },
  { level: 5, id: 'aprendiz', label: 'Aprendiz aplicado' },
  { level: 10, id: 'constante', label: 'Jugador constante' },
  { level: 20, id: 'tactico', label: 'Ojo táctico' },
  { level: 30, id: 'estratega', label: 'Estratega de sillón' },
  { level: 45, id: 'veterano', label: 'Veterano de tablero' },
  { level: 60, id: 'implacable', label: 'Implacable' },
  { level: 80, id: 'maestro-de-casa', label: 'Maestro de casa' },
];

// Cada skin es un sufijo de carpeta bajo pieces-medieval-<skin>/ — el set
// "default" (sin sufijo) es el crema+dorado/carbón+carmesí de siempre.
export const PIECE_SKINS = [
  { level: 1, id: 'default', label: 'Clásico (crema/carbón)' },
  { level: 10, id: 'azul', label: 'Azulado' },
  { level: 25, id: 'esmeralda', label: 'Esmeralda' },
];

export function unlockedTitles(level) {
  return TITLES.filter((t) => level >= t.level);
}

export function unlockedSkins(level) {
  return PIECE_SKINS.filter((s) => level >= s.level);
}

export function nextTitleToUnlock(level) {
  return TITLES.find((t) => level < t.level) || null;
}

export function nextSkinToUnlock(level) {
  return PIECE_SKINS.find((s) => level < s.level) || null;
}

const TITLE_KEY = 'chess-study-selected-title';
const SKIN_KEY = 'chess-study-selected-skin';

export function loadSelectedTitle() {
  return localStorage.getItem(TITLE_KEY) || 'novato';
}

export function saveSelectedTitle(id) {
  setProfileStorageItem(TITLE_KEY, id);
}

export function loadSelectedSkin() {
  return localStorage.getItem(SKIN_KEY) || 'default';
}

export function saveSelectedSkin(id) {
  setProfileStorageItem(SKIN_KEY, id);
}

// Vuelve a los valores por defecto — se usa junto con el reset de nivel de
// torneo: no tiene sentido dejar elegido un título/skin que ya no está
// desbloqueado si el nivel vuelve a 1.
export function resetRewardsSelection() {
  removeProfileStorageItem(TITLE_KEY);
  removeProfileStorageItem(SKIN_KEY);
}
