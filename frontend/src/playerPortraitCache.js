import {
  AI_NARRATIVE_MANUAL_COOLDOWN_MS,
  createAiNarrativeCache,
  formatAiNarrativeCooldown,
} from './aiNarrativeCache.js';

export const AI_PLAYER_PORTRAIT_CACHE_KEY = 'chess-study-ai-player-portrait-v1';
const PORTRAIT_SCHEMA = 9;
const GAMES_PER_AUTOMATIC_REFRESH = 1;
export const PLAYER_PORTRAIT_MAX_CHARS = 900;

const playerPortraitCache = createAiNarrativeCache({
  cacheKey: AI_PLAYER_PORTRAIT_CACHE_KEY,
  schema: PORTRAIT_SCHEMA,
  maxChars: PLAYER_PORTRAIT_MAX_CHARS,
  manualRequestKind: 'portrait_manual',
  cooldownMs: AI_NARRATIVE_MANUAL_COOLDOWN_MS,
});

export function playerPortraitGenerationKey(insights) {
  const games = Math.max(0, Number(insights?.totalGames || 0));
  return `${PORTRAIT_SCHEMA}:${Math.floor(games / GAMES_PER_AUTOMATIC_REFRESH)}`;
}

export function loadCachedPlayerPortrait(generationKey, identityScope) {
  return playerPortraitCache.load(generationKey, identityScope);
}

export function saveCachedPlayerPortrait(generationKey, text, identityScope) {
  return playerPortraitCache.save(generationKey, text, identityScope);
}

export function playerPortraitManualRefreshState(options = {}) {
  return playerPortraitCache.manualRefreshState(options);
}

export function shouldCommitManualPortraitRefresh(requestKind, text) {
  return playerPortraitCache.shouldCommitManualRefresh(requestKind, text);
}

export function markPlayerPortraitManualRefresh(options = {}) {
  return playerPortraitCache.markManualRefresh(options);
}

export function formatPlayerPortraitCooldown(ms) {
  return formatAiNarrativeCooldown(ms);
}
