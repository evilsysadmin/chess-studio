import { STORAGE_LOCAL, readJsonStorage, writeJsonStorage } from './safeStorage.js';

export const AI_TRAINING_PLAN_CACHE_KEY = 'chess-study-ai-training-plan-v1';
const TRAINING_PLAN_SCHEMA = 1;
export const TRAINING_PLAN_MAX_CHARS = 900;
const TRAINING_PLAN_MANUAL_COOLDOWN_MS = 6 * 60 * 60 * 1000;

function normalizeIdentityScope(identityScope) {
  const clean = String(identityScope || '').trim().toLowerCase();
  return clean ? clean.slice(0, 120) : null;
}

function stableHash(text) {
  // FNV-1a de 32 bits: no es seguridad, sólo una clave compacta y estable de caché.
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function trainingPlanGenerationKey(dossier) {
  const facts = dossier?.facts && typeof dossier.facts === 'object' ? dossier.facts : null;
  if (!facts) return null;
  return `${TRAINING_PLAN_SCHEMA}:${stableHash(JSON.stringify(facts))}`;
}

function readTrainingPlanCache(identityScope) {
  const scope = normalizeIdentityScope(identityScope);
  if (!scope) return null;
  const cached = readJsonStorage(STORAGE_LOCAL, AI_TRAINING_PLAN_CACHE_KEY, { fallback: null, removeMalformed: true });
  if (!cached || cached.schema !== TRAINING_PLAN_SCHEMA || cached.identityScope !== scope) return null;
  return cached;
}

export function loadCachedTrainingPlan(generationKey, identityScope) {
  if (!generationKey) return null;
  const cached = readTrainingPlanCache(identityScope);
  if (!cached || cached.generationKey !== generationKey) return null;
  if (typeof cached.text !== 'string' || !cached.text.trim()) return null;
  return cached.text.trim().slice(0, TRAINING_PLAN_MAX_CHARS);
}

export function saveCachedTrainingPlan(generationKey, text, identityScope) {
  const scope = normalizeIdentityScope(identityScope);
  const clean = typeof text === 'string' ? text.trim().slice(0, TRAINING_PLAN_MAX_CHARS) : '';
  if (!scope || !generationKey || !clean) return false;
  const previous = readTrainingPlanCache(scope) || {};
  return writeJsonStorage(STORAGE_LOCAL, AI_TRAINING_PLAN_CACHE_KEY, {
    schema: TRAINING_PLAN_SCHEMA,
    identityScope: scope,
    generationKey,
    text: clean,
    generatedAt: new Date().toISOString(),
    ...(Number.isFinite(Number(previous.manualRequestedAt)) ? { manualRequestedAt: Number(previous.manualRequestedAt) } : {}),
  });
}

export function trainingPlanManualRefreshState({ now = Date.now(), identityScope = null, bypassCooldown = false } = {}) {
  if (bypassCooldown) return { allowed: true, retryAfterMs: 0, nextAllowedAt: null };
  const cached = readTrainingPlanCache(identityScope);
  const last = Number(cached?.manualRequestedAt);
  if (!Number.isFinite(last) || last <= 0) return { allowed: true, retryAfterMs: 0, nextAllowedAt: null };
  const remaining = Math.max(0, TRAINING_PLAN_MANUAL_COOLDOWN_MS - (Number(now) - last));
  return {
    allowed: remaining <= 0,
    retryAfterMs: remaining,
    nextAllowedAt: remaining > 0 ? last + TRAINING_PLAN_MANUAL_COOLDOWN_MS : null,
  };
}

export function shouldCommitManualTrainingPlanRefresh(requestKind, text) {
  return requestKind === 'training_plan_manual' && typeof text === 'string' && Boolean(text.trim());
}

export function markTrainingPlanManualRefresh({ now = Date.now(), identityScope = null } = {}) {
  const scope = normalizeIdentityScope(identityScope);
  if (!scope) return false;
  const previous = readTrainingPlanCache(scope) || {};
  return writeJsonStorage(STORAGE_LOCAL, AI_TRAINING_PLAN_CACHE_KEY, {
    ...previous,
    schema: TRAINING_PLAN_SCHEMA,
    identityScope: scope,
    manualRequestedAt: Number(now),
  });
}

export function formatTrainingPlanCooldown(ms) {
  const totalMinutes = Math.max(1, Math.ceil(Number(ms || 0) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} min`;
  if (!minutes) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}
