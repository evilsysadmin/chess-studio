import { STORAGE_LOCAL, getStorageItem } from './safeStorage.js';
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

export function loadWorstMoveCache() {
  try {
    const raw = getStorageItem(STORAGE_LOCAL, KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (e) {
    return {};
  }
}

export function saveWorstMoveCache(cache) {
  setProfileStorageItem(KEY, JSON.stringify(cache));
}

