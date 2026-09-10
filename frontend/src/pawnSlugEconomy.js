export const PAWN_SLUG_KILL_CREDITS = Object.freeze({
  pawn: 8,
  knight: 16,
  rook: 24,
  bishop: 70,
  boss: 240,
});

export const PAWN_SLUG_ARMORY = Object.freeze({
  machinegun: Object.freeze({ unlock: 90, refill: 36, refillAmmo: 90 }),
  shotgun: Object.freeze({ unlock: 120, refill: 42, refillAmmo: 24 }),
  panzerfaust: Object.freeze({ unlock: 170, refill: 55, refillAmmo: 5 }),
  grenades: Object.freeze({ refill: 28, refillAmmo: 3 }),
  medkit: Object.freeze({ refill: 34, heal: 45 }),
});

export function pawnSlugCreditsForKill(type = 'pawn', { combo = 1 } = {}) {
  const base = PAWN_SLUG_KILL_CREDITS[type] || 0;
  const safeCombo = Math.max(1, Math.min(5, Math.floor(Number(combo) || 1)));
  return Math.round(base * (1 + (safeCombo - 1) * 0.08));
}

export function pawnSlugArmoryPurchase({ credits = 0, item, unlocked = false } = {}) {
  const offer = PAWN_SLUG_ARMORY[item];
  if (!offer) return Object.freeze({ ok: false, reason: 'unknown-item', credits });
  const cost = unlocked || offer.unlock == null ? offer.refill : offer.unlock;
  if (credits < cost) return Object.freeze({ ok: false, reason: 'insufficient-credits', credits, cost });
  return Object.freeze({
    ok: true,
    cost,
    credits: credits - cost,
    unlock: offer.unlock != null && !unlocked,
    ammo: offer.refillAmmo || 0,
    heal: offer.heal || 0,
  });
}

export {
  createPawnSlugArmoryState,
  pawnSlugArmoryOffers,
  pawnSlugBankMissionLoot,
  pawnSlugBuyArmoryItem,
} from './pawnSlugArmoryState.js';
