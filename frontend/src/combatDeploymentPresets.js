import { STORAGE_LOCAL, readJsonStorage } from './safeStorage.js';
import { setProfileStorageItem } from './profileKeys.js';
import { ensureDeploymentState, resetDeployment, setDeploymentUnit } from './combatDeployment.js';
import { setRosterDeploymentType } from './combatMetamorphosis.js';

const COMBAT_DEPLOYMENT_PRESETS_KEY = 'chess-study-combat-deployment-presets-v1';
const COMBAT_DEPLOYMENT_PRESET_SLOTS = 3;

export function loadDeploymentPresets() {
  const parsed = readJsonStorage(STORAGE_LOCAL, COMBAT_DEPLOYMENT_PRESETS_KEY, { fallback: [] });
  return (Array.isArray(parsed) ? parsed : []).slice(0, COMBAT_DEPLOYMENT_PRESET_SLOTS);
}

function normalizedPresetName(value, index) {
  const clean = String(value || '').trim().slice(0, 24);
  return clean || `Escuadra ${index + 1}`;
}

export function captureDeploymentPreset(roster, index, name = null) {
  const slot = Math.max(0, Math.min(COMBAT_DEPLOYMENT_PRESET_SLOTS - 1, Number(index) || 0));
  const state = ensureDeploymentState(roster);
  const deployment = { ...(state.deployment || {}) };
  const forms = {};
  const identityIds = {};
  for (const unitKey of Object.values(deployment)) {
    const requested = state.pieces?.[unitKey]?.deploymentType || String(unitKey || '').split('-')[0];
    if (requested) forms[unitKey] = requested;
    const identityId = state.identities?.[unitKey]?.identityId;
    if (typeof identityId === 'string' && identityId) identityIds[unitKey] = identityId;
  }
  const preset = {
    version: 2,
    name: normalizedPresetName(name, slot),
    savedAt: new Date().toISOString(),
    deployment,
    forms,
    identityIds,
  };
  const all = loadDeploymentPresets();
  all[slot] = preset;
  setProfileStorageItem(COMBAT_DEPLOYMENT_PRESETS_KEY, JSON.stringify(all));
  return all;
}

export function applyDeploymentPreset(roster, preset) {
  if (!preset?.deployment || typeof preset.deployment !== 'object') return ensureDeploymentState(roster);
  let next = resetDeployment(ensureDeploymentState(roster));
  // Los presets v2 siguen al SOLDADO, no a la clave de su puesto: si una
  // baja fue reemplazada, ese mismo slot ya pertenece a otra identidad.
  // v1 conserva la lectura histórica porque no almacenaba identityId.
  const sameIdentity = (unitKey) => (
    preset.version === 1
    || (preset.version === 2
      && typeof preset.identityIds?.[unitKey] === 'string'
      && Boolean(preset.identityIds[unitKey])
      && preset.identityIds[unitKey] === next.identities?.[unitKey]?.identityId)
  );

  // Las formas se intentan primero; si el veterano ya no cumple requisitos,
  // setRosterDeploymentType conserva el estado válido y el preset no fuerza nada ilegal.
  for (const [unitKey, targetType] of Object.entries(preset.forms || {})) {
    if (!sameIdentity(unitKey)) continue;
    next = setRosterDeploymentType(next, unitKey, targetType);
  }

  // Partimos del deployment actual, pero cada asignación guardada sustituye a
  // su ocupante sólo cuando sigue siendo compatible y la identidad existe.
  for (const [slotKey, unitKey] of Object.entries(preset.deployment)) {
    if (!sameIdentity(unitKey)) continue;
    next = setDeploymentUnit(next, slotKey, unitKey);
  }
  return ensureDeploymentState(next);
}
