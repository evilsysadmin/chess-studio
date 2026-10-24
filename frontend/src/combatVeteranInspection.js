import { deploymentSlotForSquare, deploymentSquareForSlot, effectiveDeploymentType, ensureDeploymentState } from './combatDeployment.js';
import { originTypeForRosterKey } from './combatDeployment.js';
import { combatVeteranDisplayLevel, pieceRankForLevel } from './combatRanks.js';
import { unitDecorations, unitRecordForKey, unitServiceMarks } from './combatUnitService.js';

// Read-only lookup: use the same canonical deployment as deploymentFen(),
// including legacy migration, reserves and invalid/duplicate slot rejection.
// Otherwise a rendered piece may have no dossier, or a corrupt save may
// attribute its slot to the wrong persistent veteran.
function deployedVeteranAtSquare(roster, square) {
  const slot = deploymentSlotForSquare(square, 'w');
  const unitKey = slot && roster?.deployment?.[slot.key];
  if (!unitKey || unitKey === 'k-e') return null;
  const identity = roster?.identities?.[unitKey];
  const saved = roster?.pieces?.[unitKey];
  if (!identity?.identityId || saved?.alive === false) return null;
  const record = unitRecordForKey(roster, unitKey);
  // Historical records can lack the explicit identityId but are still keyed
  // by the live identity in unitRecords. Reject only proven contradictions.
  if (record?.identityId && record.identityId !== identity.identityId) return null;
  const level = combatVeteranDisplayLevel(saved);
  const stats = record?.stats || {};
  const safeCount = (key) => Number.isFinite(Number(stats[key]))
    ? Math.max(0, Math.floor(Number(stats[key]))) : 0;
  return {
    square,
    unitKey,
    identityId: identity.identityId,
    alias: identity.alias || record?.alias || 'Unidad sin alias',
    rank: pieceRankForLevel(level).label,
    level,
    battlefieldType: effectiveDeploymentType(roster, unitKey) || originTypeForRosterKey(unitKey),
    battles: safeCount('battles'),
    survivals: safeCount('survivals'),
    kills: safeCount('kills'),
    decorations: unitDecorations(record),
    serviceMarks: unitServiceMarks(record),
  };
}

export function combatVeteranAtSquare(roster, square) {
  return deployedVeteranAtSquare(ensureDeploymentState(roster), square);
}

export function combatVeteranInspectionOptions(roster) {
  // Normalize just once for the full selector, not once per square.
  const state = ensureDeploymentState(roster);
  return Object.keys(state.deployment || {})
    .map((slot) => deploymentSquareForSlot(slot, 'w'))
    .filter(Boolean)
    .sort((a, b) => Number(a[1]) - Number(b[1]) || a.localeCompare(b))
    .map((square) => deployedVeteranAtSquare(state, square))
    .filter(Boolean);
}
