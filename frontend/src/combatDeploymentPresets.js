import { setProfileStorageItem } from './profileKeys.js';
import { ensureDeploymentState, resetDeployment, setDeploymentUnit } from './combatDeployment.js';
import { setRosterDeploymentType } from './combatMetamorphosis.js';

export const COMBAT_DEPLOYMENT_PRESETS_KEY = 'chess-study-combat-deployment-presets-v1';
export const COMBAT_DEPLOYMENT_PRESET_SLOTS = 3;

function safeParse(raw) {
  try {
    const parsed = JSON.parse(raw || 'null');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function loadDeploymentPresets() {
  if (typeof localStorage === 'undefined') return [];
  return safeParse(localStorage.getItem(COMBAT_DEPLOYMENT_PRESETS_KEY)).slice(0, COMBAT_DEPLOYMENT_PRESET_SLOTS);
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
  for (const unitKey of Object.values(deployment)) {
    const requested = state.pieces?.[unitKey]?.deploymentType || String(unitKey || '').split('-')[0];
    if (requested) forms[unitKey] = requested;
  }
  const preset = {
    version: 1,
    name: normalizedPresetName(name, slot),
    savedAt: new Date().toISOString(),
    deployment,
    forms,
  };
  const all = loadDeploymentPresets();
  all[slot] = preset;
  setProfileStorageItem(COMBAT_DEPLOYMENT_PRESETS_KEY, JSON.stringify(all));
  return all;
}

export function applyDeploymentPreset(roster, preset) {
  if (!preset?.deployment || typeof preset.deployment !== 'object') return ensureDeploymentState(roster);
  let next = resetDeployment(ensureDeploymentState(roster));

  // Las formas se intentan primero; si el veterano ya no cumple requisitos,
  // setRosterDeploymentType conserva el estado válido y el preset no fuerza nada ilegal.
  for (const [unitKey, targetType] of Object.entries(preset.forms || {})) {
    next = setRosterDeploymentType(next, unitKey, targetType);
  }

  // Partimos del deployment actual, pero cada asignación guardada sustituye a
  // su ocupante sólo cuando sigue siendo compatible y la identidad existe.
  for (const [slotKey, unitKey] of Object.entries(preset.deployment)) {
    next = setDeploymentUnit(next, slotKey, unitKey);
  }
  return ensureDeploymentState(next);
}
