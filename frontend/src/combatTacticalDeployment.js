import { deploymentSummary, effectiveDeploymentType, ensureDeploymentState } from './combatDeployment.js';

export const COMBAT_TACTICAL_DEPLOYMENT_VERSION = 1;

function finiteInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : 0;
}

function unitOrderRow(state, unitKey) {
  const saved = state?.pieces?.[unitKey] || {};
  const identity = state?.identities?.[unitKey] || {};
  const mercenary = saved?.mercenary || null;
  return [
    unitKey,
    identity.identityId || null,
    identity.alias || null,
    saved.alive !== false,
    finiteInt(saved.strengthPoints),
    finiteInt(saved.speedPoints),
    finiteInt(saved.bankedXp),
    saved.deploymentType || null,
    saved.equippedTechnique || null,
    Array.isArray(saved.unlockedTechniques) ? [...saved.unlockedTechniques].sort() : [],
    saved.equipmentId || null,
    mercenary ? [
      mercenary.offerId || null,
      mercenary.contract || null,
      finiteInt(mercenary.battlesRemaining),
      mercenary.specialtyId || null,
    ] : null,
  ];
}

// La confirmación representa una orden operativa completa, no un booleano.
// Además de slot/identidad/forma incluimos el estado del barracón que puede
// alterar la fuerza o la economía de salida. Así una compra, contratación,
// renombre o mejora posterior exige reconfirmar en vez de quedar revertida por
// el snapshot congelado al iniciar la batalla.
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
  const units = Object.keys(state.pieces || {}).sort().map((unitKey) => unitOrderRow(state, unitKey));
  return JSON.stringify({
    version: COMBAT_TACTICAL_DEPLOYMENT_VERSION,
    rows,
    units,
    credits: finiteInt(state.credits),
  });
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
