import {
  STORAGE_LOCAL,
  getStorageItem,
  setStorageItem,
} from '../safeStorage.js';

const AUTH_USERNAME_KEY = 'chess-study-auth-username';

export const CHRONICLES_RUN_STORAGE_KEY = 'chess-study-chronicles-run-v1';

// Legacy adapter-specific keys remain readable for one-way migration only.
// Runtime ownership is now shared by first-person Chronicles and Tactics.
export const CHRONICLES_TACTICS_RUN_STORAGE_KEY = 'chess-study-chronicles-tactics-run-v2';
export const CHRONICLES_FIRST_PERSON_RUN_STORAGE_KEY = 'chess-study-chronicles-first-person-run-v1';

const LEGACY_RUN_STORAGE_KEYS = Object.freeze({
  tactics: CHRONICLES_TACTICS_RUN_STORAGE_KEY,
  'first-person': CHRONICLES_FIRST_PERSON_RUN_STORAGE_KEY,
});

function legacyStorageKeyFor(scope) {
  const key = LEGACY_RUN_STORAGE_KEYS[String(scope || '').trim()];
  if (!key) throw new Error(`Unknown Chronicles run scope: ${scope}`);
  return key;
}

function currentOwner() {
  return String(getStorageItem(STORAGE_LOCAL, AUTH_USERNAME_KEY) || '').trim().toLowerCase();
}

function createRunId() {
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  } catch {
    // Fall through to a compact non-cryptographic id; uniqueness is enough here.
  }
  return `chronicles-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function readStoredRun(storageKey) {
  try {
    const raw = getStorageItem(STORAGE_LOCAL, storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.id !== 'string' || !parsed.id.trim()) return null;
    const owner = String(parsed.owner || '').trim().toLowerCase();
    if (owner !== currentOwner()) return null;
    return { id: parsed.id.trim(), owner, ended: Boolean(parsed.ended) };
  } catch {
    return null;
  }
}

function writeRunState(run) {
  return setStorageItem(STORAGE_LOCAL, CHRONICLES_RUN_STORAGE_KEY, JSON.stringify(run));
}

function readRunState(scope) {
  const preferredLegacyKey = legacyStorageKeyFor(scope);
  const shared = readStoredRun(CHRONICLES_RUN_STORAGE_KEY);
  if (shared) return shared;

  // Migration is intentionally first-entry-wins. If old first-person and
  // Tactics sessions disagree, whichever adapter the player opens first
  // establishes the canonical run; the other adapter then follows it.
  const migrationKeys = [
    preferredLegacyKey,
    ...Object.values(LEGACY_RUN_STORAGE_KEYS).filter((key) => key !== preferredLegacyKey),
  ];
  for (const storageKey of migrationKeys) {
    const legacy = readStoredRun(storageKey);
    if (!legacy || legacy.ended) continue;
    writeRunState(legacy);
    return legacy;
  }
  return null;
}

export function beginChroniclesRun(scope) {
  legacyStorageKeyFor(scope);
  const run = { id: createRunId(), owner: currentOwner(), ended: false };
  writeRunState(run);
  return run.id;
}

export function ensureChroniclesRun(scope) {
  const current = readRunState(scope);
  if (current && !current.ended) return current.id;
  return beginChroniclesRun(scope);
}

export function renewChroniclesRun(scope, runId) {
  const current = readRunState(scope);
  if (current && !current.ended && current.id !== runId) return current.id;
  if (current && current.id === runId && !current.ended) {
    writeRunState({ ...current, ended: true });
  }
  return beginChroniclesRun(scope);
}

export function finishChroniclesRun(scope, runId) {
  const current = readRunState(scope);
  if (!current || current.id !== runId) return false;
  writeRunState({ ...current, ended: true });
  return true;
}
