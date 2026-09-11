import { STORAGE_LOCAL, readJsonStorage } from './safeStorage.js';
import { setProfileStorageItem } from './profileKeys.js';

// worstMoveCache.js — Cachea el resultado de analizar cada partida/batalla
// para "Buscar mi peor jugada de siempre", matcheado por el id del
// registro (`gameHistory.js`/`combatHistory.js` ya le dan un id estable a
// cada uno). Sin esto, cada búsqueda reanalizaba TODO el historial de
// cero — aunque una partida terminada nunca cambia, así que su análisis
// de la vez pasada sigue siendo válido para siempre. Vive en
// localStorage y se sincroniza a Mongo vía el mismo mecanismo de perfil
// que el resto del progreso (`profileBackup.js`, `EXPORTABLE_KEYS`) — no
// hizo falta ningún endpoint nuevo en el backend.

const KEY = 'chess-study-worst-move-cache';
// gameHistory conserva 120 registros y combatHistory 25. Mantener más
// análisis que ambos historiales juntos sólo puede conservar entradas
// huérfanas de partidas que ya no son accesibles desde la aplicación.
const MAX_CACHE_RECORDS = 145;

function pruneWorstMoveCache(cache) {
  if (!cache || typeof cache !== 'object' || Array.isArray(cache)) return {};
  const entries = Object.entries(cache);
  if (entries.length <= MAX_CACHE_RECORDS) return cache;

  entries.sort(([, a], [, b]) => {
    const aTime = Date.parse(a?.analyzedAt || '') || 0;
    const bTime = Date.parse(b?.analyzedAt || '') || 0;
    return bTime - aTime;
  });
  return Object.fromEntries(entries.slice(0, MAX_CACHE_RECORDS));
}

export function loadWorstMoveCache() {
  const parsed = readJsonStorage(STORAGE_LOCAL, KEY, { fallback: {} });
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

export function saveWorstMoveCache(cache) {
  setProfileStorageItem(KEY, JSON.stringify(pruneWorstMoveCache(cache)));
}

