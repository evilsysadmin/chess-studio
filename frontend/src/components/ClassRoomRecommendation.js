import { PATTERN_IMPROVEMENT_STATES } from '../playerModel.js';

export function classRoomEntryRecommendation(playerModel) {
  const patterns = Array.isArray(playerModel?.recurringErrors) ? playerModel.recurringErrors : [];
  const pattern = patterns.find((item) => (
    item
    && Number(item.positions || 0) >= 2
    && Number(item.pending || 0) > 0
    && item.improvementState !== PATTERN_IMPROVEMENT_STATES.CORRECTED_WITH_SUFFICIENT_SAMPLE
    && item.filter?.incidentKey
  ));
  if (!pattern) return null;

  return Object.freeze({
    incidentKey: pattern.filter.incidentKey,
    label: String(pattern.label || 'Patrón recurrente'),
    positions: Math.max(2, Number(pattern.positions || 0)),
    pending: Math.max(1, Number(pattern.pending || 0)),
    sourceGames: Math.max(0, Number(pattern.sourceGames || 0)),
    maxLoss: Math.max(0, Number(pattern.maxLoss || 0)),
    filter: Object.freeze({
      incidentKey: pattern.filter.incidentKey,
      label: String(pattern.label || 'Patrón recurrente'),
    }),
  });
}
