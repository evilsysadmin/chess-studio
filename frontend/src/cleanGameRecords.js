import { STORAGE_LOCAL, readJsonStorage } from './safeStorage.js';

export const CLEAN_GAMES_KEY = 'chess-study-clean-games-v1';

function safeRecords() {
  const parsed = readJsonStorage(STORAGE_LOCAL, CLEAN_GAMES_KEY, { fallback: {} });
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}


export function loadCleanGameRecords() {
  return safeRecords();
}

