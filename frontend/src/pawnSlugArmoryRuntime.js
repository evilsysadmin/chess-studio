import { createPawnSlugGame } from './pawnSlugThree.js';
import { setPawnSlugRuntimeRpgEnabled } from './pawnSlug.js';
import { pawnSlugLiveWeaponLabel, pawnSlugLiveWeaponModel } from './pawnSlugLiveWeaponModels.js';
import { destroyPawnSlugPremiumSfx } from './pawnSlugSfx.js';
import {
  pawnSlugBuyOrEquipWeaponModel,
  pawnSlugWeaponModelOffers,
  refreshPawnSlugWeaponModelArmory,
} from './pawnSlugWeaponModelArmory.js';

function decorateHud(hud, spentCredits = 0, expertMode = false) {
  if (!hud) return hud;
  return {
    ...hud,
    credits: expertMode ? Math.max(0, Math.floor(Number(hud.credits) || 0) - spentCredits) : 0,
    weaponLabel: pawnSlugLiveWeaponLabel(hud.weapon),
    weaponModelId: pawnSlugLiveWeaponModel(hud.weapon)?.id || null,
    weapons: (hud.weapons || []).map((weapon) => ({
      ...weapon,
      label: pawnSlugLiveWeaponLabel(weapon.id),
      modelId: pawnSlugLiveWeaponModel(weapon.id)?.id || null,
    })),
    weaponModels: expertMode ? pawnSlugWeaponModelOffers() : [],
  };
}

export function createPawnSlugArmoryGame(host, { onReady, onHud, expertMode = false } = {}) {
  const expert = expertMode === true;
  refreshPawnSlugWeaponModelArmory();
  setPawnSlugRuntimeRpgEnabled(expert);
  let latestHud = null;
  let spentCredits = 0;
  let engine;

  function forwardHud(nextHud) {
    latestHud = nextHud;
    onHud?.(decorateHud(nextHud, spentCredits, expert));
  }

  try {
    engine = createPawnSlugGame(host, { onReady, onHud: forwardHud });
  } catch (error) {
    setPawnSlugRuntimeRpgEnabled(true);
    throw error;
  }

  return {
    ...engine,
    destroy() {
      try {
        engine.destroy?.();
      } finally {
        setPawnSlugRuntimeRpgEnabled(true);
        destroyPawnSlugPremiumSfx();
      }
    },
    buyOrEquipWeaponModel(weaponId, modelId) {
      if (!expert) return Object.freeze({ ok: false, reason: 'expert-mode-disabled' });
      if (!latestHud || latestHud.phase === 'playing') return Object.freeze({ ok: false, reason: 'mission-in-progress' });
      const available = Math.max(0, Math.floor(Number(latestHud.credits) || 0) - spentCredits);
      const result = pawnSlugBuyOrEquipWeaponModel({ weaponId, modelId, credits: available });
      if (!result.ok) return result;
      spentCredits += result.cost;
      onHud?.(decorateHud(latestHud, spentCredits, expert));
      return result;
    },
  };
}

export const PAWN_SLUG_ARMORY_RUNTIME_META = Object.freeze({
  purchaseWindow: 'overlay-only',
  combatDelegation: 'pawnSlugThree',
  creditLedger: 'current-runtime-session',
  expertModeOwnsEconomyAndRpg: true,
  premiumSfxLifecycle: 'destroy-with-runtime',
});
