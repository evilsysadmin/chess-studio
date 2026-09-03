import {
  STORAGE_LOCAL,
  getStorageItem,
  removeStorageItem,
  setStorageItem,
} from './safeStorage.js';

export const STORAGE_SCHEMA_KEY = 'chess-study-storage-schema-version';
export const STORAGE_SCHEMA_VERSION = 3;

const LEGACY_MUTE_KEY = 'chess-study-muted';
const MUSIC_MUTED_KEY = 'chess-study-music-muted';
const FX_MUTED_KEY = 'chess-study-fx-muted';
const BOARD_RENDERER_KEY = 'chess-study-board-renderer';
const OBSOLETE_KEYS = Object.freeze([
  'chess-study-cpu-personality',
  'chess-study-ambient-theme',
]);

function schemaVersion() {
  const raw = getStorageItem(STORAGE_LOCAL, STORAGE_SCHEMA_KEY);
  if (raw === null) return 0;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function migrateV0ToV1() {
  // Antes existía un mute global. Si el usuario todavía no eligió los canales
  // separados, heredamos su preferencia; nunca pisamos una elección moderna.
  const legacyMute = getStorageItem(STORAGE_LOCAL, LEGACY_MUTE_KEY);
  if (legacyMute === '0' || legacyMute === '1') {
    if (getStorageItem(STORAGE_LOCAL, MUSIC_MUTED_KEY) === null) {
      setStorageItem(STORAGE_LOCAL, MUSIC_MUTED_KEY, legacyMute);
    }
    if (getStorageItem(STORAGE_LOCAL, FX_MUTED_KEY) === null) {
      setStorageItem(STORAGE_LOCAL, FX_MUTED_KEY, legacyMute);
    }
  }
}

function migrateV1ToV2() {
  // Claves de features retiradas. No son saves ni progreso recuperable y sólo
  // pueden confundir código nuevo si reaparecen desde instalaciones antiguas.
  for (const key of OBSOLETE_KEYS) removeStorageItem(STORAGE_LOCAL, key);
}

function migrateV2ToV3() {
  // War Room pasa a ser la experiencia principal. Esta migración es deliberada
  // y one-shot: perfiles existentes que estaban en 2D reciben 3D una vez. Si
  // después vuelven manualmente a 2D, la versión 3 ya queda marcada y esa
  // elección futura se respeta.
  if (getStorageItem(STORAGE_LOCAL, BOARD_RENDERER_KEY) === '2d') {
    const migrated = setStorageItem(STORAGE_LOCAL, BOARD_RENDERER_KEY, '3d');
    if (!migrated) throw new Error('board renderer migration was not durable');
  }
}

const MIGRATIONS = Object.freeze({
  0: migrateV0ToV1,
  1: migrateV1ToV2,
  2: migrateV2ToV3,
});

export function migratePersistentStorage() {
  const from = schemaVersion();
  if (from > STORAGE_SCHEMA_VERSION) {
    // Nunca degradamos ni limpiamos datos de una versión futura: arrancamos con
    // defaults seguros y dejamos intacto lo que este cliente no comprende.
    return { status: 'future', from, to: from };
  }

  let version = from;
  let durable = true;
  while (version < STORAGE_SCHEMA_VERSION) {
    const migration = MIGRATIONS[version];
    if (typeof migration !== 'function') return { status: 'incomplete', from, to: version, durable: false };
    try {
      migration();
    } catch {
      return { status: 'degraded', from, to: version, durable: false };
    }
    version += 1;
    durable = setStorageItem(STORAGE_LOCAL, STORAGE_SCHEMA_KEY, String(version)) && durable;
  }

  return { status: durable ? 'ok' : 'degraded', from, to: version, durable };
}