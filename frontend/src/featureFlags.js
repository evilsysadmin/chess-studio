export const DEFAULT_MATCHMAKING_TARGET_LEAD_ELO = 50;
let runtimeMatchmakingTargetLeadElo = DEFAULT_MATCHMAKING_TARGET_LEAD_ELO;

function normalizeMatchmakingTargetLeadElo(value) {
  const raw = Number(value);
  return Number.isFinite(raw)
    ? Math.max(0, Math.min(150, Math.round(raw)))
    : DEFAULT_MATCHMAKING_TARGET_LEAD_ELO;
}

export function setRuntimeMatchmakingTargetLeadElo(value) {
  runtimeMatchmakingTargetLeadElo = normalizeMatchmakingTargetLeadElo(value);
  return runtimeMatchmakingTargetLeadElo;
}

export function getRuntimeMatchmakingTargetLeadElo() {
  return runtimeMatchmakingTargetLeadElo;
}

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
  const matchmakingTargetLeadElo = setRuntimeMatchmakingTargetLeadElo(payload?.matchmaking?.targetLeadElo);
  return { ...flags, matchmakingTargetLeadElo };
}
