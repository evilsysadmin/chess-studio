import { pawnSlugApplyWeaponModel, pawnSlugWeaponModel } from './pawnSlugWeaponModels.js';

export const PAWN_SLUG_LIVE_WEAPON_MODELS = Object.freeze({
  pistol: Object.freeze({ family: 'pistol', modelId: 'dienstpistole' }),
  machinegun: Object.freeze({ family: 'machinegun', modelId: 'mg42' }),
  shotgun: Object.freeze({ family: 'shotgun', modelId: 'm3-super90' }),
  panzerfaust: Object.freeze({ family: 'launcher', modelId: 'panzerfaust' }),
});

export function pawnSlugLiveWeaponModel(weaponId) {
  const binding = PAWN_SLUG_LIVE_WEAPON_MODELS[weaponId] || PAWN_SLUG_LIVE_WEAPON_MODELS.pistol;
  return pawnSlugWeaponModel(binding.family, binding.modelId);
}

export function pawnSlugLiveWeaponLabel(weaponId) {
  return pawnSlugLiveWeaponModel(weaponId)?.label || weaponId;
}

export function pawnSlugApplyLiveWeaponModel(stats, weaponId) {
  const binding = PAWN_SLUG_LIVE_WEAPON_MODELS[weaponId] || PAWN_SLUG_LIVE_WEAPON_MODELS.pistol;
  return pawnSlugApplyWeaponModel(stats, binding.family, binding.modelId);
}

export const PAWN_SLUG_LIVE_WEAPON_META = Object.freeze({
  selection: 'fixed-default-until-armory-selection',
  affectsStats: true,
  hudUsesConcreteLabel: true,
  visualUsesFamilyAtlas: true,
});
