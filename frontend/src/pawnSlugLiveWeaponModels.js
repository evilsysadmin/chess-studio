import { pawnSlugApplyWeaponModel, pawnSlugWeaponModel } from './pawnSlugWeaponModels.js';
import { pawnSlugEquippedModelId } from './pawnSlugWeaponModelArmory.js';

export const PAWN_SLUG_LIVE_WEAPON_MODELS = Object.freeze({
  pistol: Object.freeze({ family: 'pistol', modelId: 'dienstpistole' }),
  machinegun: Object.freeze({ family: 'machinegun', modelId: 'mg42' }),
  shotgun: Object.freeze({ family: 'shotgun', modelId: 'm3-super90' }),
  panzerfaust: Object.freeze({ family: 'launcher', modelId: 'panzerfaust' }),
});

function bindingFor(weaponId) {
  return PAWN_SLUG_LIVE_WEAPON_MODELS[weaponId] || PAWN_SLUG_LIVE_WEAPON_MODELS.pistol;
}

export function pawnSlugLiveWeaponModel(weaponId) {
  const binding = bindingFor(weaponId);
  return pawnSlugWeaponModel(binding.family, pawnSlugEquippedModelId(weaponId));
}

export function pawnSlugLiveWeaponLabel(weaponId) {
  return pawnSlugLiveWeaponModel(weaponId)?.label || weaponId;
}

export function pawnSlugApplyLiveWeaponModel(stats, weaponId) {
  const binding = bindingFor(weaponId);
  return pawnSlugApplyWeaponModel(stats, binding.family, pawnSlugEquippedModelId(weaponId));
}

export const PAWN_SLUG_LIVE_WEAPON_META = Object.freeze({
  selection: 'persistent-armory-sidegrades',
  affectsStats: true,
  hudUsesConcreteLabel: true,
  visualUsesFamilyAtlas: true,
});
