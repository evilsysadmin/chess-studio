import {
  getStorageItem,
  STORAGE_LOCAL,
} from '../safeStorage.js';
import { setProfileStorageItem } from '../profileKeys.js';
import { PVP_DUEL_ROOM_RUNTIME_MODEL_URL } from './PvpDuelRoomAsset.js';
import { COMBAT_OPERATIONS_ROOM_RUNTIME_MODEL_URL } from './CombatOperationsRoomAsset.js';
import { r2AssetUrl } from '../r2Assets.js';

export const WAR_ROOM_VARIANT_STORAGE_KEY = 'chess-study-war-room-variant-v1';
export const WAR_ROOM_VARIANT_CHANGED_EVENT = 'chess-war-room-variant-changed';
export const DEFAULT_WAR_ROOM_VARIANT = 'v3';
export const DEFAULT_WAR_ROOM_VARIANT_PREFERENCE = 'v3';
export const WAR_ROOM_VARIANT_PREFERENCES = Object.freeze([
  Object.freeze({ id: 'random', label: 'Aleatoria' }),
  Object.freeze({ id: 'classic', label: 'War Room v1' }),
  Object.freeze({ id: 'v2', label: 'War Room v2' }),
  Object.freeze({ id: 'v3', label: 'War Room v3' }),
  Object.freeze({ id: 'v4', label: 'War Room v4' }),
]);
export const WAR_ROOM_VARIANTS = Object.freeze([
  Object.freeze({ id: 'classic', label: 'War Room v1', shell: 'procedural' }),
  Object.freeze({
    id: 'v2',
    label: 'War Room v2',
    shell: 'blender',
    runtimeModelUrl: r2AssetUrl('warRoom.v2.runtime'),
    cacheBustBuild: false,
    hansStage: true,
    loadInstaller: () => import('./WarRoomV2Shell.js').then(({ installWarRoomV2Shell }) => installWarRoomV2Shell),
  }),
  Object.freeze({
    id: 'v3',
    label: 'War Room v3',
    shell: 'blender',
    runtimeModelUrl: r2AssetUrl('warRoom.v3.runtime'),
    cacheBustBuild: false,
    hansStage: true,
    loadInstaller: () => import('./WarRoomV3Shell.js').then(({ installWarRoomV3Shell }) => installWarRoomV3Shell),
  }),
  Object.freeze({
    id: 'v4',
    label: 'War Room v4',
    shell: 'blender',
    // Selectable explicitly while it is validated on device; never drawn by
    // the «Aleatoria» preference until it graduates.
    randomPool: false,
    runtimeModelUrl: r2AssetUrl('warRoom.v4.runtime'),
    cacheBustBuild: false,
    hansStage: true,
    loadInstaller: () => import('./WarRoomV4Shell.js').then(({ installWarRoomV4Shell }) => installWarRoomV4Shell),
  }),
]);

// Internal renderer variants are addressable by explicit board overrides but are
// deliberately absent from WAR_ROOM_VARIANTS. They therefore never appear in
// the normal room selector and are never selected by the random preference.
const INTERNAL_WAR_ROOM_VARIANTS = Object.freeze([
  Object.freeze({
    id: 'duel',
    label: 'Duel Room',
    shell: 'blender',
    internal: true,
    runtimeModelUrl: PVP_DUEL_ROOM_RUNTIME_MODEL_URL,
    cacheBustBuild: false,
    loadInstaller: () => import('./PvpDuelRoomShell.js').then(({ installPvpDuelRoomShell }) => installPvpDuelRoomShell),
  }),
  Object.freeze({
    id: 'combat-ops',
    label: 'Combat Operations Room',
    shell: 'blender',
    internal: true,
    runtimeModelUrl: COMBAT_OPERATIONS_ROOM_RUNTIME_MODEL_URL,
    cacheBustBuild: false,
    loadInstaller: () => import('./CombatOperationsRoomShell.js').then(({ installCombatOperationsRoomShell }) => installCombatOperationsRoomShell),
  }),
]);

const VARIANTS_BY_ID = new Map(
  [...WAR_ROOM_VARIANTS, ...INTERNAL_WAR_ROOM_VARIANTS].map((variant) => [variant.id, variant]),
);
const VALID_VARIANTS = new Set(VARIANTS_BY_ID.keys());
const VALID_VARIANT_PREFERENCES = new Set(WAR_ROOM_VARIANT_PREFERENCES.map(({ id }) => id));
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

export function normalizeWarRoomVariantPreference(value) {
  return VALID_VARIANT_PREFERENCES.has(value) ? value : DEFAULT_WAR_ROOM_VARIANT_PREFERENCE;
}

export function loadWarRoomVariantPreference(options = {}) {
  if (!isWarRoomVariantSelectable(options)) return 'classic';
  return normalizeWarRoomVariantPreference(getStorageItem(STORAGE_LOCAL, WAR_ROOM_VARIANT_STORAGE_KEY));
}

export function saveWarRoomVariantPreference(value, options = {}) {
  if (!isWarRoomVariantSelectable(options)) return 'classic';
  const normalized = normalizeWarRoomVariantPreference(value);
  setProfileStorageItem(WAR_ROOM_VARIANT_STORAGE_KEY, normalized);
  return normalized;
}

export function resolveWarRoomVariantPreference(value, { random = Math.random } = {}) {
  const normalized = normalizeWarRoomVariantPreference(value);
  if (normalized !== 'random') return normalizeWarRoomVariant(normalized);
  const variants = WAR_ROOM_VARIANTS.filter(({ randomPool }) => randomPool !== false).map(({ id }) => id);
  const sample = Math.max(0, Math.min(0.999999, Number(random?.()) || 0));
  return variants[Math.floor(sample * variants.length)] || DEFAULT_WAR_ROOM_VARIANT;
}

export function normalizeWarRoomVariant(value) {
  return VALID_VARIANTS.has(value) ? value : 'classic';
}

export function warRoomVariantDefinition(value) {
  return VARIANTS_BY_ID.get(normalizeWarRoomVariant(value));
}

export function isClassicWarRoomVariant({ selectable = false, variant = 'classic' } = {}) {
  const definition = warRoomVariantDefinition(variant);
  return (!selectable && definition?.internal !== true) || definition?.shell === 'procedural';
}

export function warRoomVariantSupportsHans(value) {
  return warRoomVariantDefinition(value)?.hansStage === true;
}

export function loadWarRoomVariantInstaller(value) {
  const definition = warRoomVariantDefinition(value);
  if (!definition?.loadInstaller) {
    return Promise.reject(new Error(`War Room ${definition?.id || value || 'unknown'} has no external shell installer`));
  }
  return definition.loadInstaller();
}

export function warRoomVariantRuntimeModelUrl(value, { buildSha = import.meta.env.VITE_BUILD_SHA } = {}) {
  const definition = warRoomVariantDefinition(value);
  const baseUrl = definition?.runtimeModelUrl;
  if (!baseUrl) return null;
  if (definition?.cacheBustBuild === false) return baseUrl;
  const version = String(buildSha || '').trim();
  if (!version) return baseUrl;
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}build=${encodeURIComponent(version)}`;
}

export function prefetchWarRoomVariant(value, {
  documentRef = globalThis.document,
  buildSha = import.meta.env.VITE_BUILD_SHA,
} = {}) {
  const definition = warRoomVariantDefinition(value);
  if (!definition?.loadInstaller) return Promise.resolve(false);

  // Start downloading the JS installer immediately. The model itself is warmed
  // through <link rel=preload> so mobile browsers can stream/cache it without
  // keeping a second ArrayBuffer alive in application memory.
  const installerWarmup = definition.loadInstaller().then(() => true).catch(() => false);
  const modelUrl = warRoomVariantRuntimeModelUrl(value, { buildSha });
  if (!modelUrl || !documentRef?.head?.appendChild || !documentRef?.createElement) return installerWarmup;

  const selector = `link[data-war-room-prefetch="${definition.id}"][href="${modelUrl}"]`;
  if (!documentRef.querySelector?.(selector)) {
    const link = documentRef.createElement('link');
    link.rel = 'preload';
    link.as = 'fetch';
    link.href = modelUrl;
    link.crossOrigin = 'anonymous';
    link.dataset.warRoomPrefetch = definition.id;
    documentRef.head.appendChild(link);
  }
  return installerWarmup;
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
  setProfileStorageItem(WAR_ROOM_VARIANT_STORAGE_KEY, normalized);
  return normalized;
}
