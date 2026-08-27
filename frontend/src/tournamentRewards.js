import { STORAGE_LOCAL, getStorageItem } from './safeStorage.js';
import { setProfileStorageItem } from './profileKeys.js';

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

export const PIECE_SKINS = [
  { level: 1, id: 'default', label: 'Pixel medieval', description: 'El clásico de Chess Studio.' },
  { level: 1, id: 'studio', label: 'Studio Marfil', description: 'Ilustrado, limpio y detallado.' },
  { level: 5, id: 'regimiento', label: 'Regimiento Español', description: 'Ceremonial rojo, oro y marfil.' },
  { level: 10, id: 'azul', label: 'Pixel azulado', description: 'Variante fría del set medieval.' },
  { level: 15, id: 'shogunate', label: 'Shogunato Neón', description: 'Samuráis de marfil, cobalto y carmesí.' },
  { level: 25, id: 'esmeralda', label: 'Pixel esmeralda', description: 'Variante de campaña en verde.' },
  { level: 30, id: 'cyber', label: 'División Cyber', description: 'Siluetas futuristas de luz fría.' },
  { level: 45, id: 'marines', label: 'Marines Expedicionarios', description: 'Uniforme de campaña y mando táctico.' },
  { level: 60, id: 'delta', label: 'Delta Nocturna', description: 'Operadores de élite en negro y rojo.' },
];

export function unlockedTitles(level, { isAdmin = false } = {}) {
  return isAdmin ? TITLES : TITLES.filter((t) => level >= t.level);
}

export function unlockedSkins(level, { isAdmin = false } = {}) {
  return isAdmin ? PIECE_SKINS : PIECE_SKINS.filter((s) => level >= s.level);
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
  return getStorageItem(STORAGE_LOCAL, TITLE_KEY) || 'novato';
}

export function saveSelectedTitle(id) {
  setProfileStorageItem(TITLE_KEY, id);
}

export function loadSelectedSkin() {
  return getStorageItem(STORAGE_LOCAL, SKIN_KEY) || 'studio';
}

export function saveSelectedSkin(id) {
  const safeId = PIECE_SKINS.some((skin) => skin.id === id) ? id : 'studio';
  setProfileStorageItem(SKIN_KEY, safeId);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('chess-piece-skin-change', { detail: safeId }));
}
