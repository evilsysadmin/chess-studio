import { STORAGE_LOCAL, getStorageItem, setStorageItem } from './safeStorage.js';

export const WAR_ROOM_AMBIENCE_MUTED_KEY = 'chess-study-war-room-ambience-muted-v1';
export const WAR_ROOM_AMBIENCE_CHANGED_EVENT = 'chess-study-war-room-ambience-changed';

export function isWarRoomAmbienceMuted() {
  return getStorageItem(STORAGE_LOCAL, WAR_ROOM_AMBIENCE_MUTED_KEY) === '1';
}

export function setWarRoomAmbienceMuted(muted) {
  const normalized = Boolean(muted);
  setStorageItem(STORAGE_LOCAL, WAR_ROOM_AMBIENCE_MUTED_KEY, normalized ? '1' : '0');
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(WAR_ROOM_AMBIENCE_CHANGED_EVENT));
  }
  return normalized;
}
