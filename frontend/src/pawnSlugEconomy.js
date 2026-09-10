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

const ARMORY_WEAPON_ITEMS = Object.freeze(['machinegun', 'shotgun', 'panzerfaust']);

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

function freezeWeaponState(value = {}) {
  return Object.freeze({
    unlocked: Boolean(value.unlocked),
    ammo: Math.max(0, Math.floor(Number(value.ammo) || 0)),
  });
}

export function createPawnSlugArmoryState(seed = {}) {
  const weapons = Object.fromEntries(ARMORY_WEAPON_ITEMS.map((id) => [id, freezeWeaponState(seed.weapons?.[id])]));
  return Object.freeze({
    credits: Math.max(0, Math.floor(Number(seed.credits) || 0)),
    grenades: Math.max(0, Math.floor(Number(seed.grenades) || 0)),
    weapons: Object.freeze(weapons),
  });
}

export function pawnSlugArmoryOffers(state = createPawnSlugArmoryState()) {
  return Object.freeze([
    ...ARMORY_WEAPON_ITEMS.map((id) => {
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
  const nextWeapons = Object.fromEntries(ARMORY_WEAPON_ITEMS.map((id) => {
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
