import { STORAGE_LOCAL, getStorageItem, setStorageItem } from '../safeStorage.js';

const FX_KEY = 'chronicles-fx-volume';
const MUSIC_KEY = 'chronicles-music-volume';
const clamp = (value) => Math.max(0, Math.min(1, Number.isFinite(Number(value)) ? Number(value) : 1));

function read(key) {
  const raw = getStorageItem(STORAGE_LOCAL, key);
  return raw === null ? 1 : clamp(raw);
}

export const getChroniclesFxVolume = () => read(FX_KEY);
export const getChroniclesMusicVolume = () => read(MUSIC_KEY);
export function setChroniclesFxVolume(value) {
  const level = clamp(value);
  setStorageItem(STORAGE_LOCAL, FX_KEY, String(level));
  return level;
}
export function setChroniclesMusicVolume(value) {
  const level = clamp(value);
  setStorageItem(STORAGE_LOCAL, MUSIC_KEY, String(level));
  return level;
}
