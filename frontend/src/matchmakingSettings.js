export const DEFAULT_MATCHMAKING_TARGET_LEAD_ELO = 50;
const MIN_MATCHMAKING_TARGET_LEAD_ELO = 0;
const MAX_MATCHMAKING_TARGET_LEAD_ELO = 150;

let targetLeadElo = DEFAULT_MATCHMAKING_TARGET_LEAD_ELO;

export function normalizeMatchmakingTargetLeadElo(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_MATCHMAKING_TARGET_LEAD_ELO;
  return Math.max(MIN_MATCHMAKING_TARGET_LEAD_ELO, Math.min(MAX_MATCHMAKING_TARGET_LEAD_ELO, Math.round(numeric)));
}

export function setMatchmakingTargetLeadElo(value) {
  targetLeadElo = normalizeMatchmakingTargetLeadElo(value);
  return targetLeadElo;
}

export function getMatchmakingTargetLeadElo() {
  return targetLeadElo;
}
