import {
  getStorageItem,
  setStorageItem,
  STORAGE_LOCAL,
} from '../safeStorage.js';

export const WAR_ROOM_VARIANT_STORAGE_KEY = 'chess-study-war-room-variant-v1';
export const WAR_ROOM_VARIANT_CHANGED_EVENT = 'chess-war-room-variant-changed';
// What a player gets when variants are enabled and they have not picked one. A pick made in
// the War Room «…» menu is stored per device and always wins; only an absent (or corrupt)
// value falls back to this. v1 ("classic") stays available there as the rollback baseline.
export const DEFAULT_WAR_ROOM_VARIANT = 'v2';
export const WAR_ROOM_VARIANTS = Object.freeze([
  Object.freeze({ id: 'classic', label: 'War Room v1', shell: 'procedural' }),
  Object.freeze({
    id: 'v2',
    label: 'War Room v2',
    shell: 'blender',
    loadInstaller: () => import('./WarRoomV2Shell.js').then(({ installWarRoomV2Shell }) => installWarRoomV2Shell),
  }),
  Object.freeze({
    id: 'v3',
    label: 'War Room v3',
    shell: 'blender',
    loadInstaller: () => import('./WarRoomV3Shell.js').then(({ installWarRoomV3Shell }) => installWarRoomV3Shell),
  }),
]);

const VARIANTS_BY_ID = new Map(WAR_ROOM_VARIANTS.map((variant) => [variant.id, variant]));
const VALID_VARIANTS = new Set(VARIANTS_BY_ID.keys());
const STAGING_HOST = 'staging.chess-studio.shadowops.dpdns.org';
const STAGING_API_HOST = 'api-staging.chess-studio.shadowops.dpdns.org';

export function isWarRoomVariantSelectable({
  env = import.meta.env,
  location = globalThis?.location,
} = {}) {
  const explicit = String(env?.VITE_WAR_ROOM_VARIANTS_ENABLE || '').trim().toLowerCase();
  if (explicit === '1' || explicit === 'true') return true;
  const hostname = String(location?.hostname || '').trim().toLowerCase();
  const apiUrl = String(env?.VITE_API_URL || '').trim().toLowerCase();
  return hostname === STAGING_HOST || apiUrl.includes(STAGING_API_HOST);
}

export function normalizeWarRoomVariant(value) {
  return VALID_VARIANTS.has(value) ? value : 'classic';
}

export function warRoomVariantDefinition(value) {
  return VARIANTS_BY_ID.get(normalizeWarRoomVariant(value));
}

export function isClassicWarRoomVariant({ selectable = false, variant = 'classic' } = {}) {
  return !selectable || warRoomVariantDefinition(variant)?.shell === 'procedural';
}

export function loadWarRoomVariantInstaller(value) {
  const definition = warRoomVariantDefinition(value);
  if (!definition?.loadInstaller) {
    return Promise.reject(new Error(`War Room ${definition?.id || value || 'unknown'} has no external shell installer`));
  }
  return definition.loadInstaller();
}

export function warRoomVariantDomData(variant, status) {
  return {
    'data-board3d-variant': normalizeWarRoomVariant(variant),
    'data-board3d-variant-status': status,
  };
}

export function loadWarRoomVariant(options = {}) {
  // Variants disabled (no VITE_WAR_ROOM_VARIANTS_ENABLE, not staging): the classic room, so a
  // local dev build and the plain e2e build stay deterministic. Production and staging builds
  // set the flag, and this is also the rollback lever: unset it and everyone is back on v1.
  if (!isWarRoomVariantSelectable(options)) return 'classic';
  const stored = getStorageItem(STORAGE_LOCAL, WAR_ROOM_VARIANT_STORAGE_KEY);
  return VALID_VARIANTS.has(stored) ? stored : DEFAULT_WAR_ROOM_VARIANT;
}

export function saveWarRoomVariant(value, options = {}) {
  if (!isWarRoomVariantSelectable(options)) return 'classic';
  const normalized = normalizeWarRoomVariant(value);
  setStorageItem(STORAGE_LOCAL, WAR_ROOM_VARIANT_STORAGE_KEY, normalized);
  return normalized;
}
