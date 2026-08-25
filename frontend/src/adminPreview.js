import { STORAGE_SESSION, getStorageItem, setStorageItem } from './safeStorage.js';

const ADMIN_PREVIEW_KEY = 'chess-study-admin-preview';

// Los desbloqueos de administración viven sólo durante la sesión. No son una
// recompensa ni cambian el perfil del jugador: sirven para revisar contenido
// que todavía no se ha ganado con esa cuenta.
export function setAdminPreviewAccess(enabled) {
  setStorageItem(STORAGE_SESSION, ADMIN_PREVIEW_KEY, enabled ? '1' : '0');
}

export function hasAdminPreviewAccess() {
  return getStorageItem(STORAGE_SESSION, ADMIN_PREVIEW_KEY) === '1';
}
