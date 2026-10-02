export const PVP_MATCH_FULL_RECONCILE_MS = 15000;
export const PVP_MATCH_LEGACY_RECONCILE_MS = 3000;

export function pvpMatchPulseNeedsFullRefresh({
  currentRevision = 0,
  pulseRevision = null,
  currentOpponentPresence = null,
  pulseOpponentPresence = null,
  lifecycleDue = false,
  lastFullAt = 0,
  nowMs = Date.now(),
  reconcileMs = PVP_MATCH_FULL_RECONCILE_MS,
} = {}) {
  if (lifecycleDue) return true;
  if (pulseRevision === null || pulseRevision === undefined) return true;
  if (Number(pulseRevision) !== Number(currentRevision)) return true;
  if (!lastFullAt) return true;

  const elapsed = Number(nowMs) - Number(lastFullAt);
  const hasPresenceHint = pulseOpponentPresence !== null
    && pulseOpponentPresence !== undefined
    && currentOpponentPresence !== null
    && currentOpponentPresence !== undefined;

  // During blue/green rollout an older Go edge may not expose presence yet.
  // Keep the previous 3 s safety reconcile instead of trusting a missing hint.
  if (!hasPresenceHint) {
    return elapsed >= Math.min(Number(reconcileMs), PVP_MATCH_LEGACY_RECONCILE_MS);
  }
  if (String(pulseOpponentPresence) !== String(currentOpponentPresence)) return true;
  return elapsed >= Number(reconcileMs);
}
