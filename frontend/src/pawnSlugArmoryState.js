import { PAWN_SLUG_ARMORY, pawnSlugArmoryPurchase } from './pawnSlugEconomy.js';

const WEAPON_ITEMS = Object.freeze(['machinegun', 'shotgun', 'panzerfaust']);

function freezeWeaponState(value = {}) {
  return Object.freeze({
    unlocked: Boolean(value.unlocked),
    ammo: Math.max(0, Math.floor(Number(value.ammo) || 0)),
  });
}

export function createPawnSlugArmoryState(seed = {}) {
  const weapons = Object.fromEntries(WEAPON_ITEMS.map((id) => [id, freezeWeaponState(seed.weapons?.[id])]));
  return Object.freeze({
    credits: Math.max(0, Math.floor(Number(seed.credits) || 0)),
    grenades: Math.max(0, Math.floor(Number(seed.grenades) || 0)),
    weapons: Object.freeze(weapons),
  });
}

export function pawnSlugArmoryOffers(state = createPawnSlugArmoryState()) {
  return Object.freeze([
    ...WEAPON_ITEMS.map((id) => {
      const slot = state.weapons[id];
      const offer = PAWN_SLUG_ARMORY[id];
      return Object.freeze({
        id,
        kind: slot.unlocked ? 'refill' : 'unlock',
        cost: slot.unlocked ? offer.refill : offer.unlock,
        ammo: offer.refillAmmo,
        unlocked: slot.unlocked,
      });
    }),
    Object.freeze({ id: 'grenades', kind: 'refill', cost: PAWN_SLUG_ARMORY.grenades.refill, ammo: PAWN_SLUG_ARMORY.grenades.refillAmmo, unlocked: true }),
    Object.freeze({ id: 'medkit', kind: 'heal', cost: PAWN_SLUG_ARMORY.medkit.refill, heal: PAWN_SLUG_ARMORY.medkit.heal, unlocked: true }),
  ]);
}

export function pawnSlugBuyArmoryItem(state, item) {
  const current = createPawnSlugArmoryState(state);
  const weapon = current.weapons[item];
  const result = pawnSlugArmoryPurchase({ credits: current.credits, item, unlocked: Boolean(weapon?.unlocked) });
  if (!result.ok) return Object.freeze({ ok: false, reason: result.reason, cost: result.cost, state: current });

  if (weapon) {
    return Object.freeze({
      ok: true,
      cost: result.cost,
      state: createPawnSlugArmoryState({
        ...current,
        credits: result.credits,
        weapons: {
          ...current.weapons,
          [item]: { unlocked: true, ammo: weapon.ammo + result.ammo },
        },
      }),
    });
  }

  if (item === 'grenades') {
    return Object.freeze({
      ok: true,
      cost: result.cost,
      state: createPawnSlugArmoryState({ ...current, credits: result.credits, grenades: current.grenades + result.ammo }),
    });
  }

  return Object.freeze({ ok: true, cost: result.cost, heal: result.heal, state: createPawnSlugArmoryState({ ...current, credits: result.credits }) });
}

export function pawnSlugBankMissionLoot(state, { credits = 0, grenades = 0, weapons = {} } = {}) {
  const current = createPawnSlugArmoryState(state);
  const nextWeapons = Object.fromEntries(WEAPON_ITEMS.map((id) => {
    const currentSlot = current.weapons[id];
    const incoming = weapons[id] || {};
    return [id, {
      unlocked: currentSlot.unlocked || Boolean(incoming.unlocked),
      ammo: currentSlot.ammo + Math.max(0, Math.floor(Number(incoming.ammo) || 0)),
    }];
  }));
  return createPawnSlugArmoryState({
    credits: current.credits + Math.max(0, Math.floor(Number(credits) || 0)),
    grenades: current.grenades + Math.max(0, Math.floor(Number(grenades) || 0)),
    weapons: nextWeapons,
  });
}
