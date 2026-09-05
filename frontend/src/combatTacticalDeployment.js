import { effectiveDeploymentType, ensureDeploymentState } from './combatDeployment.js';

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
