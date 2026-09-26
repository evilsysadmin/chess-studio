import { QUICK_MATCH_TARGET_LEAD_ELO, setRuntimeQuickMatchTargetLeadElo } from './quickMatchDifficulty.js';

export const DEFAULT_MATCHMAKING_TARGET_LEAD_ELO = QUICK_MATCH_TARGET_LEAD_ELO;

export const DEFAULT_FEATURE_FLAGS = Object.freeze({
  homeGuide: true,
  postGameFeedback: true,
  spectator: true,
});

export function normalizeFeatureFlags(payload) {
  const source = payload?.features && typeof payload.features === 'object' ? payload.features : payload;
  const flags = !source || typeof source !== 'object'
    ? { ...DEFAULT_FEATURE_FLAGS }
    : Object.fromEntries(
      Object.entries(DEFAULT_FEATURE_FLAGS).map(([key, defaultValue]) => [
        key,
        typeof source[key] === 'boolean' ? source[key] : defaultValue,
      ]),
    );
  const matchmakingTargetLeadElo = setRuntimeQuickMatchTargetLeadElo(payload?.matchmaking?.targetLeadElo);
  return { ...flags, matchmakingTargetLeadElo };
}
