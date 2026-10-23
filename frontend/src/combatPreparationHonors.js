import { deploymentSquareForSlot, ensureDeploymentState } from './combatDeployment.js';
import { unitDecorations, unitRecordForKey } from './combatUnitService.js';

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
    const level = 1 + Math.max(0, Number(saved.strengthPoints) || 0)
      + Math.max(0, Number(saved.speedPoints) || 0);
    if (level > 1) rankLevels[square] = level;
    const decorations = unitDecorations(unitRecordForKey(state, unitKey));
    if (decorations.length > 0) medalCounts[square] = decorations.length;
  }
  return { rankLevels, medalCounts };
}
