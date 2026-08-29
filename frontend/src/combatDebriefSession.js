import { STORAGE_SESSION, readJsonStorage, removeStorageItem, writeJsonStorage } from './safeStorage.js';

const KEY = 'chess-study-combat-post-battle-debrief-v1';
const VERSION = 1;
const MAX_ENTRIES = 4;

function cleanId(value) {
  const id = String(value || '').trim();
  return id || null;
}

function readBucket() {
  const parsed = readJsonStorage(STORAGE_SESSION, KEY, { fallback: null, removeMalformed: true });
  if (parsed?.version !== VERSION || !parsed.entries || typeof parsed.entries !== 'object' || Array.isArray(parsed.entries)) return {};
  return parsed.entries;
}

function writeBucket(entries) {
  const list = Object.entries(entries || {})
    .filter(([id, entry]) => cleanId(id) && entry?.debrief && typeof entry.debrief === 'object')
    .sort((a, b) => String(b[1]?.savedAt || '').localeCompare(String(a[1]?.savedAt || '')))
    .slice(0, MAX_ENTRIES);
  if (!list.length) return removeStorageItem(STORAGE_SESSION, KEY);
  return writeJsonStorage(STORAGE_SESSION, KEY, { version: VERSION, entries: Object.fromEntries(list) });
}

export function saveCombatDebriefSession(contextId, debrief) {
  const id = cleanId(contextId);
  if (!id || !debrief || typeof debrief !== 'object') return false;
  const entries = readBucket();
  entries[id] = { savedAt: new Date().toISOString(), debrief };
  return writeBucket(entries);
}

export function loadCombatDebriefSession(contextId) {
  const id = cleanId(contextId);
  if (!id) return null;
  const entry = readBucket()[id];
  return entry?.debrief && typeof entry.debrief === 'object' ? entry.debrief : null;
}

export function clearCombatDebriefSession(contextId = null) {
  if (contextId == null) return removeStorageItem(STORAGE_SESSION, KEY);
  const id = cleanId(contextId);
  if (!id) return false;
  const entries = readBucket();
  delete entries[id];
  return writeBucket(entries);
}
