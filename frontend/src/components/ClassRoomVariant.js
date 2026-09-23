import { getStorageItem, setStorageItem, STORAGE_LOCAL } from '../safeStorage.js';
import { isWarRoomVariantSelectable, normalizeWarRoomVariant } from './WarRoomVariant.js';

export const CLASS_ROOM_VARIANT_STORAGE_KEY = 'chess-study-class-room-variant-v1';

export function isClassRoomVariantSelectable(options = {}) {
  return isWarRoomVariantSelectable(options);
}

export function loadClassRoomVariant(options = {}) {
  if (!isClassRoomVariantSelectable(options)) return 'classic';
  return normalizeWarRoomVariant(getStorageItem(STORAGE_LOCAL, CLASS_ROOM_VARIANT_STORAGE_KEY) || 'classic');
}

export function saveClassRoomVariant(value, options = {}) {
  if (!isClassRoomVariantSelectable(options)) return 'classic';
  const normalized = normalizeWarRoomVariant(value);
  setStorageItem(STORAGE_LOCAL, CLASS_ROOM_VARIANT_STORAGE_KEY, normalized);
  return normalized;
}
