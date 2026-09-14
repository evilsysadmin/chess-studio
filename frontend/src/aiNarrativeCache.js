import { STORAGE_LOCAL, readJsonStorage, writeJsonStorage } from './safeStorage.js';
import { cooldownStateFromTimestamp } from './cooldownClock.js';

export const AI_NARRATIVE_MANUAL_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const IDENTITY_SCOPE_MAX_CHARS = 120;
const CACHE_STORE_VERSION = 1;
const MAX_IDENTITY_RECORDS = 6;

function normalizeIdentityScope(identityScope) {
  const clean = String(identityScope || '').trim().toLowerCase();
  return clean ? clean.slice(0, IDENTITY_SCOPE_MAX_CHARS) : null;
}

export function createAiNarrativeCache({
  cacheKey,
  schema,
  maxChars = 900,
  manualRequestKind,
  cooldownMs = AI_NARRATIVE_MANUAL_COOLDOWN_MS,
  generationKeyRequired = false,
} = {}) {
  function readStored() {
    return readJsonStorage(STORAGE_LOCAL, cacheKey, { fallback: null, removeMalformed: true });
  }

  function recordsFromStored(stored) {
    if (!stored || typeof stored !== 'object') return [];
    if (stored.storeVersion === CACHE_STORE_VERSION && Array.isArray(stored.records)) {
      return stored.schema === schema ? stored.records : [];
    }
    // Compatibilidad con el formato legacy: un único registro ocupaba la raíz.
    return [stored];
  }

  function validRecord(record) {
    return Boolean(record && typeof record === 'object' && record.schema === schema && normalizeIdentityScope(record.identityScope));
  }

  function read(identityScope) {
    const scope = normalizeIdentityScope(identityScope);
    if (!scope) return null;
    const records = recordsFromStored(readStored());
    for (let index = records.length - 1; index >= 0; index -= 1) {
      const record = records[index];
      if (validRecord(record) && record.identityScope === scope) return record;
    }
    return null;
  }

  function writeRecord(record) {
    const records = recordsFromStored(readStored())
      .filter(validRecord)
      .filter((entry) => entry.identityScope !== record.identityScope);
    const nextRecords = [...records.slice(-(MAX_IDENTITY_RECORDS - 1)), record];
    return writeJsonStorage(STORAGE_LOCAL, cacheKey, {
      schema,
      storeVersion: CACHE_STORE_VERSION,
      records: nextRecords,
    });
  }

  function load(generationKey, identityScope) {
    if (generationKeyRequired && !generationKey) return null;
    const cached = read(identityScope);
    if (!cached || cached.generationKey !== generationKey) return null;
    if (typeof cached.text !== 'string' || !cached.text.trim()) return null;
    return cached.text.trim().slice(0, maxChars);
  }

  function save(generationKey, text, identityScope) {
    const scope = normalizeIdentityScope(identityScope);
    const clean = typeof text === 'string' ? text.trim().slice(0, maxChars) : '';
    if (!scope || (generationKeyRequired && !generationKey) || !clean) return false;
    const previous = read(scope) || {};
    return writeRecord({
      schema,
      identityScope: scope,
      generationKey,
      text: clean,
      generatedAt: new Date().toISOString(),
      ...(Number.isFinite(Number(previous.manualRequestedAt)) ? { manualRequestedAt: Number(previous.manualRequestedAt) } : {}),
    });
  }

  function manualRefreshState({ now = Date.now(), identityScope = null, bypassCooldown = false } = {}) {
    if (bypassCooldown) return { allowed: true, retryAfterMs: 0, nextAllowedAt: null };
    const cached = read(identityScope);
    return cooldownStateFromTimestamp({
      now,
      last: cached?.manualRequestedAt,
      cooldownMs,
    });
  }

  function shouldCommitManualRefresh(requestKind, text) {
    return requestKind === manualRequestKind && typeof text === 'string' && Boolean(text.trim());
  }

  function markManualRefresh({ now = Date.now(), identityScope = null } = {}) {
    const scope = normalizeIdentityScope(identityScope);
    if (!scope) return false;
    const previous = read(scope) || {};
    return writeRecord({
      ...previous,
      schema,
      identityScope: scope,
      manualRequestedAt: Number(now),
    });
  }

  return Object.freeze({
    load,
    save,
    manualRefreshState,
    shouldCommitManualRefresh,
    markManualRefresh,
  });
}

export function formatAiNarrativeCooldown(ms) {
  const totalMinutes = Math.max(1, Math.ceil(Number(ms || 0) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} min`;
  if (!minutes) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}
