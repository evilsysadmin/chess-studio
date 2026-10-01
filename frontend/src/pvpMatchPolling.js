export const PVP_MATCH_FULL_RECONCILE_MS = 3000;

export function pvpMatchPulseNeedsFullRefresh({
  currentRevision = 0,
  pulseRevision = null,
  lifecycleDue = false,
  lastFullAt = 0,
  nowMs = Date.now(),
  reconcileMs = PVP_MATCH_FULL_RECONCILE_MS,
} = {}) {
  if (lifecycleDue) return true;
  if (pulseRevision === null || pulseRevision === undefined) return true;
  if (Number(pulseRevision) !== Number(currentRevision)) return true;
  if (!lastFullAt) return true;
  return Number(nowMs) - Number(lastFullAt) >= Number(reconcileMs);
}
