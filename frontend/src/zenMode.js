import { setProfileStorageItem } from './profileKeys.js';

const KEY = 'chess-study-zen-mode';

export function loadZenMode() {
  return localStorage.getItem(KEY) === '1';
}

export function saveZenMode(enabled) {
  const next = !!enabled;
  setProfileStorageItem(KEY, next ? '1' : '0');
  return next;
}

export function zenModeSummary(enabled) {
  return enabled
    ? 'Zen activo · sin coordenadas, ayudas visuales, comentarios, chat ni notación.'
    : 'Zen desactivado · ayudas y contexto visibles.';
}
