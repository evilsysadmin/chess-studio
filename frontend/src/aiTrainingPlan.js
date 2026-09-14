import {
  AI_NARRATIVE_MANUAL_COOLDOWN_MS,
  createAiNarrativeCache,
  formatAiNarrativeCooldown,
} from './aiNarrativeCache.js';

export const AI_TRAINING_PLAN_CACHE_KEY = 'chess-study-ai-training-plan-v1';
const TRAINING_PLAN_SCHEMA = 1;
export const TRAINING_PLAN_MAX_CHARS = 900;

const trainingPlanCache = createAiNarrativeCache({
  cacheKey: AI_TRAINING_PLAN_CACHE_KEY,
  schema: TRAINING_PLAN_SCHEMA,
  maxChars: TRAINING_PLAN_MAX_CHARS,
  manualRequestKind: 'training_plan_manual',
  cooldownMs: AI_NARRATIVE_MANUAL_COOLDOWN_MS,
  generationKeyRequired: true,
});

function stableHash(text) {
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

export function loadCachedTrainingPlan(generationKey, identityScope) {
  return trainingPlanCache.load(generationKey, identityScope);
}

export function saveCachedTrainingPlan(generationKey, text, identityScope) {
  return trainingPlanCache.save(generationKey, text, identityScope);
}

export function trainingPlanManualRefreshState(options = {}) {
  return trainingPlanCache.manualRefreshState(options);
}

export function shouldCommitManualTrainingPlanRefresh(requestKind, text) {
  return trainingPlanCache.shouldCommitManualRefresh(requestKind, text);
}

export function markTrainingPlanManualRefresh(options = {}) {
  return trainingPlanCache.markManualRefresh(options);
}

export function formatTrainingPlanCooldown(ms) {
  return formatAiNarrativeCooldown(ms);
}
