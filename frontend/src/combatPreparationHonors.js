import { deploymentSquareForSlot, ensureDeploymentState } from './combatDeployment.js';
import { unitDecorations, unitRecordForKey } from './combatUnitService.js';
import { combatVeteranDisplayLevel } from './combatRanks.js';

// Read-only from the deployed identity. Rank progression and campaign medals are
// independent: levels cannot award a decoration, only the saved service record.
export function combatPreparationHonors(roster) {
  const state = ensureDeploymentState(roster);
  const rankLevels = {};
  const medalCounts = {};
  for (const [slotKey, unitKey] of Object.entries(state.deployment || {})) {
    const square = deploymentSquareForSlot(slotKey, 'w');
    if (!square || !unitKey) continue;
    const saved = state.pieces?.[unitKey] || {};
    const level = combatVeteranDisplayLevel(saved);
    if (level > 1) rankLevels[square] = level;
    // A slot is not an identity: a stale record may still be stored under
    // the replacement's key after an interrupted migration. Do not project
    // the predecessor's honours onto the live recruit's physical plinth.
    const identityId = state.identities?.[unitKey]?.identityId;
    const record = unitRecordForKey(state, unitKey);
    const ownedRecord = record && (!record.identityId || record.identityId === identityId) ? record : null;
    const decorations = unitDecorations(ownedRecord);
    if (decorations.length > 0) medalCounts[square] = decorations.length;
  }
  return { rankLevels, medalCounts };
}
