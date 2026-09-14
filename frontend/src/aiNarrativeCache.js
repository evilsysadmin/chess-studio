import { STORAGE_LOCAL, readJsonStorage, writeJsonStorage } from './safeStorage.js';
import { cooldownStateFromTimestamp } from './cooldownClock.js';

export const AI_NARRATIVE_MANUAL_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const IDENTITY_SCOPE_MAX_CHARS = 120;

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
  function read(identityScope) {
    const scope = normalizeIdentityScope(identityScope);
    if (!scope) return null;
    const cached = readJsonStorage(STORAGE_LOCAL, cacheKey, { fallback: null, removeMalformed: true });
    if (!cached || typeof cached !== 'object' || cached.schema !== schema || cached.identityScope !== scope) return null;
    return cached;
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
    return writeJsonStorage(STORAGE_LOCAL, cacheKey, {
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
    return writeJsonStorage(STORAGE_LOCAL, cacheKey, {
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
