import { pawnSlugApplyWeaponModel, pawnSlugWeaponModel } from './pawnSlugWeaponModels.js';

export const PAWN_SLUG_LIVE_WEAPON_MODELS = Object.freeze({
  pistol: Object.freeze({ family: 'pistol', modelId: 'dienstpistole' }),
  machinegun: Object.freeze({ family: 'machinegun', modelId: 'mg42' }),
  shotgun: Object.freeze({ family: 'shotgun', modelId: 'm3-super90' }),
  panzerfaust: Object.freeze({ family: 'launcher', modelId: 'panzerfaust' }),
});

function bindingFor(weaponId) {
  return PAWN_SLUG_LIVE_WEAPON_MODELS[weaponId] || PAWN_SLUG_LIVE_WEAPON_MODELS.pistol;
}

function resolvedModelId(weaponId, selectedModelId = null) {
  const binding = bindingFor(weaponId);
  if (selectedModelId && pawnSlugWeaponModel(binding.family, selectedModelId)?.id === selectedModelId) return selectedModelId;
  return binding.modelId;
}

export function pawnSlugLiveWeaponModel(weaponId, selectedModelId = null) {
  const binding = bindingFor(weaponId);
  return pawnSlugWeaponModel(binding.family, resolvedModelId(weaponId, selectedModelId));
}

export function pawnSlugLiveWeaponLabel(weaponId, selectedModelId = null) {
  return pawnSlugLiveWeaponModel(weaponId, selectedModelId)?.label || weaponId;
}

export function pawnSlugApplyLiveWeaponModel(stats, weaponId, selectedModelId = null) {
  const binding = bindingFor(weaponId);
  return pawnSlugApplyWeaponModel(stats, binding.family, resolvedModelId(weaponId, selectedModelId));
}

export const PAWN_SLUG_LIVE_WEAPON_META = Object.freeze({
  selection: 'armory-selectable-with-safe-default',
  affectsStats: true,
  hudUsesConcreteLabel: true,
  visualUsesFamilyAtlas: true,
});
