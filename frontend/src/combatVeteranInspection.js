import { deploymentSlotForSquare, deploymentSquareForSlot, effectiveDeploymentType } from './combatDeployment.js';
import { originTypeForRosterKey } from './combatDeployment.js';
import { pieceRankForLevel } from './combatRanks.js';
import { unitDecorations, unitRecordForKey, unitServiceMarks } from './combatUnitService.js';

// Read-only lookup: the visible square maps to a DEPLOYMENT SLOT, which
// resolves to the active persistent unit identity. Never use the square as
// an identity, or inherit a dead predecessor's medals after replacement.
export function combatVeteranAtSquare(roster, square) {
  const slot = deploymentSlotForSquare(square, 'w');
  const unitKey = slot && roster?.deployment?.[slot.key];
  if (!unitKey || unitKey === 'k-e') return null;
  const identity = roster?.identities?.[unitKey];
  const saved = roster?.pieces?.[unitKey];
  if (!identity?.identityId || saved?.alive === false) return null;
  const record = unitRecordForKey(roster, unitKey);
  if (record && record.identityId !== identity.identityId) return null;
  const level = 1 + Math.max(0, Number(saved?.strengthPoints) || 0)
    + Math.max(0, Number(saved?.speedPoints) || 0);
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

export function combatVeteranInspectionOptions(roster) {
  return Object.keys(roster?.deployment || {})
    .map((slot) => deploymentSquareForSlot(slot, 'w'))
    .filter(Boolean)
    .sort((a, b) => Number(a[1]) - Number(b[1]) || a.localeCompare(b))
    .map((square) => combatVeteranAtSquare(roster, square))
    .filter(Boolean);
}
