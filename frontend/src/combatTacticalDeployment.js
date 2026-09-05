import { deploymentSummary, effectiveDeploymentType, ensureDeploymentState } from './combatDeployment.js';

export const COMBAT_TACTICAL_DEPLOYMENT_VERSION = 1;

// La confirmación de una operación debe representar una formación concreta,
// no un booleano que pueda sobrevivir por accidente a una rehidratación o a
// una mutación del barracón. Incluimos slot, identidad persistente y forma de
// batalla: cambiar cualquiera de las tres cosas exige confirmar de nuevo.
export function deploymentSelectionFingerprint(rosterState) {
  const state = ensureDeploymentState(rosterState);
  const rows = Object.entries(state.deployment || {})
    .filter(([, unitKey]) => typeof unitKey === 'string' && unitKey)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([slotKey, unitKey]) => [
      slotKey,
      unitKey,
      effectiveDeploymentType(state, unitKey) || null,
    ]);
  return JSON.stringify({ version: COMBAT_TACTICAL_DEPLOYMENT_VERSION, rows });
}

// El roster ya se persiste como JSON en el perfil; la copia de confirmación
// usa el mismo contrato serializable. Esto rompe referencias compartidas de
// React y garantiza que una mutación posterior del barracón no reescriba la
// fuerza que el jugador acaba de confirmar.
export function freezeTacticalRosterSnapshot(rosterState) {
  const state = ensureDeploymentState(rosterState);
  return JSON.parse(JSON.stringify(state));
}

function investedVeteran(rosterState, unitKey) {
  const saved = rosterState?.pieces?.[unitKey];
  return saved?.alive !== false && (
    Math.max(0, Number(saved?.strengthPoints) || 0)
    + Math.max(0, Number(saved?.speedPoints) || 0)
  ) > 0;
}

export function buildTacticalDeploymentBrief(rosterState, { difficultyBalance = null } = {}) {
  const state = ensureDeploymentState(rosterState);
  const summary = deploymentSummary(state);
  const deployedVeteranKeys = summary.deployedKeys.filter((key) => key !== 'k-e' && investedVeteran(state, key));
  const protectedVeteranKeys = summary.reserveKeys.filter((key) => investedVeteran(state, key));
  const appliedBonus = Number(difficultyBalance?.appliedBonus);

  return {
    version: COMBAT_TACTICAL_DEPLOYMENT_VERSION,
    fingerprint: deploymentSelectionFingerprint(state),
    barracksCount: summary.totalRoster,
    deployedCount: summary.assignedCount,
    battleSlots: summary.totalSlots,
    reserveCount: summary.reserveCount,
    deployedVeteranCount: deployedVeteranKeys.length,
    protectedVeteranCount: protectedVeteranKeys.length,
    protectedVeteranKeys,
    threatBonus: Number.isFinite(appliedBonus) ? Math.max(0, appliedBonus) : null,
    threatTier: typeof difficultyBalance?.threat?.tier === 'string' ? difficultyBalance.threat.tier : null,
  };
}
