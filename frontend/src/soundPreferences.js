import { setProfileStorageItem } from './profileKeys.js';
import { STORAGE_LOCAL, getStorageItem } from './safeStorage.js';

const LEGACY_MUTE_KEY = 'chess-study-muted';
const MUSIC_MUTED_KEY = 'chess-study-music-muted';
const FX_MUTED_KEY = 'chess-study-fx-muted';
const MUSIC_VOLUME_KEY = 'chess-study-music-volume';
export const MUSIC_RADIO_MODE_KEY = 'chess-study-music-radio-mode';
export const MUSIC_FAVORITES_KEY = 'chess-study-music-favorites';
export const MUSIC_EXCLUDED_KEY = 'chess-study-music-excluded';

function readChannelMuted(key) {
  const explicit = getStorageItem(STORAGE_LOCAL, key);
  if (explicit !== null) return explicit === '1';
  // Compatibilidad con perfiles anteriores que solo tenían un mute global.
  return getStorageItem(STORAGE_LOCAL, LEGACY_MUTE_KEY) === '1';
}

export function isMusicMuted() {
  return readChannelMuted(MUSIC_MUTED_KEY);
}

export function isFxMuted() {
  return readChannelMuted(FX_MUTED_KEY);
}

export function writeMusicMuted(muted) {
  setProfileStorageItem(MUSIC_MUTED_KEY, muted ? '1' : '0');
}

export function writeFxMuted(muted) {
  setProfileStorageItem(FX_MUTED_KEY, muted ? '1' : '0');
}

export function getAmbientVolume() {
  const raw = Number.parseFloat(getStorageItem(STORAGE_LOCAL, MUSIC_VOLUME_KEY) || '1');
  if (!Number.isFinite(raw)) return 1;
  return Math.min(1, Math.max(0, raw));
}

export function writeAmbientVolume(value) {
  const normalized = Math.min(1, Math.max(0, Number(value) || 0));
  setProfileStorageItem(MUSIC_VOLUME_KEY, String(normalized));
  return normalized;
}
