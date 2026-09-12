import { createPawnSlugGame } from './pawnSlugThree.js';
import { pawnSlugLiveWeaponLabel, pawnSlugLiveWeaponModel } from './pawnSlugLiveWeaponModels.js';
import {
  pawnSlugBuyOrEquipWeaponModel,
  pawnSlugWeaponModelOffers,
  refreshPawnSlugWeaponModelArmory,
} from './pawnSlugWeaponModelArmory.js';

function decorateHud(hud, spentCredits = 0) {
  if (!hud) return hud;
  return {
    ...hud,
    credits: Math.max(0, Math.floor(Number(hud.credits) || 0) - spentCredits),
    weaponLabel: pawnSlugLiveWeaponLabel(hud.weapon),
    weaponModelId: pawnSlugLiveWeaponModel(hud.weapon)?.id || null,
    weapons: (hud.weapons || []).map((weapon) => ({
      ...weapon,
      label: pawnSlugLiveWeaponLabel(weapon.id),
      modelId: pawnSlugLiveWeaponModel(weapon.id)?.id || null,
    })),
    weaponModels: pawnSlugWeaponModelOffers(),
  };
}

export function createPawnSlugArmoryGame(host, { onReady, onHud } = {}) {
  refreshPawnSlugWeaponModelArmory();
  let latestHud = null;
  let spentCredits = 0;

  function forwardHud(nextHud) {
    latestHud = nextHud;
    onHud?.(decorateHud(nextHud, spentCredits));
  }

  const engine = createPawnSlugGame(host, { onReady, onHud: forwardHud });
  return {
    ...engine,
    buyOrEquipWeaponModel(weaponId, modelId) {
      if (!latestHud || latestHud.phase === 'playing') return Object.freeze({ ok: false, reason: 'mission-in-progress' });
      const available = Math.max(0, Math.floor(Number(latestHud.credits) || 0) - spentCredits);
      const result = pawnSlugBuyOrEquipWeaponModel({ weaponId, modelId, credits: available });
      if (!result.ok) return result;
      spentCredits += result.cost;
      onHud?.(decorateHud(latestHud, spentCredits));
      return result;
    },
  };
}

export const PAWN_SLUG_ARMORY_RUNTIME_META = Object.freeze({
  purchaseWindow: 'overlay-only',
  combatDelegation: 'pawnSlugThree',
  creditLedger: 'current-runtime-session',
});
