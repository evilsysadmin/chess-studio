import {
  getStorageItem,
  setStorageItem,
  STORAGE_LOCAL,
} from '../safeStorage.js';

export const WAR_ROOM_VARIANT_STORAGE_KEY = 'chess-study-war-room-variant-v1';
export const WAR_ROOM_VARIANTS = Object.freeze([
  Object.freeze({ id: 'classic', label: 'War Room' }),
  Object.freeze({ id: 'v2', label: 'War Room v2' }),
]);

const VALID_VARIANTS = new Set(WAR_ROOM_VARIANTS.map((variant) => variant.id));
const STAGING_HOST = 'staging.chess-studio.shadowops.dpdns.org';
const STAGING_API_HOST = 'api-staging.chess-studio.shadowops.dpdns.org';

export function isWarRoomVariantSelectable({
  env = import.meta.env,
  location = globalThis?.location,
} = {}) {
  const explicit = String(env?.VITE_WAR_ROOM_V2_ENABLE || '').trim().toLowerCase();
  if (explicit === '1' || explicit === 'true') return true;
  const hostname = String(location?.hostname || '').trim().toLowerCase();
  const apiUrl = String(env?.VITE_API_URL || '').trim().toLowerCase();
  return hostname === STAGING_HOST || apiUrl.includes(STAGING_API_HOST);
}

export function normalizeWarRoomVariant(value) {
  return VALID_VARIANTS.has(value) ? value : 'classic';
}

export function loadWarRoomVariant(options = {}) {
  if (!isWarRoomVariantSelectable(options)) return 'classic';
  return normalizeWarRoomVariant(getStorageItem(STORAGE_LOCAL, WAR_ROOM_VARIANT_STORAGE_KEY));
}

export function saveWarRoomVariant(value, options = {}) {
  if (!isWarRoomVariantSelectable(options)) return 'classic';
  const normalized = normalizeWarRoomVariant(value);
  setStorageItem(STORAGE_LOCAL, WAR_ROOM_VARIANT_STORAGE_KEY, normalized);
  return normalized;
}
