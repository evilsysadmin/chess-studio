import {
  createPawnSlugArmoryState,
  pawnSlugArmoryOffers,
  pawnSlugBuyArmoryItem,
} from './pawnSlugEconomy.js';

const WEAPON_IDS = Object.freeze(['machinegun', 'shotgun', 'panzerfaust']);

function weaponStateFromPlayer(player, id) {
  const slot = player?.arsenal?.[id] || {};
  return {
    unlocked: Boolean(slot.unlocked),
    ammo: Math.max(0, Math.floor(Number(slot.ammo) || 0)),
  };
}

export function pawnSlugArmoryStateFromGame(state = {}) {
  return createPawnSlugArmoryState({
    credits: state.credits,
    grenades: state.player?.grenades,
    weapons: Object.fromEntries(WEAPON_IDS.map((id) => [id, weaponStateFromPlayer(state.player, id)])),
  });
}

export function pawnSlugArmoryOffersForGame(state = {}) {
  return pawnSlugArmoryOffers(pawnSlugArmoryStateFromGame(state))
    .filter((entry) => entry.id !== 'medkit');
}

export function pawnSlugApplyArmoryStateToGame(state, armoryState) {
  if (!state?.player || !armoryState) return false;
  state.credits = armoryState.credits;
  state.player.grenades = armoryState.grenades;
  for (const id of WEAPON_IDS) {
    const incoming = armoryState.weapons[id];
    const slot = state.player.arsenal?.[id];
    if (!incoming || !slot) continue;
    slot.unlocked = incoming.unlocked;
    slot.ammo = incoming.ammo;
    if (state.player.weapon === id) state.player.ammo = slot.ammo;
  }
  return true;
}

export function pawnSlugBuyArmoryItemForGame(state, item) {
  if (!state?.player) return { ok: false, reason: 'invalid-state' };
  if (state.phase === 'playing') return { ok: false, reason: 'mission-active' };
  const result = pawnSlugBuyArmoryItem(pawnSlugArmoryStateFromGame(state), item);
  if (!result.ok) return result;
  pawnSlugApplyArmoryStateToGame(state, result.state);
  return result;
}

export function pawnSlugCaptureSessionLoadout(state = {}) {
  const player = state.player || {};
  return Object.freeze({
    credits: Math.max(0, Math.floor(Number(state.credits) || 0)),
    grenades: Math.max(0, Math.floor(Number(player.grenades) || 0)),
    weapon: player.weapon || 'pistol',
    arsenal: Object.freeze(Object.fromEntries(Object.entries(player.arsenal || {}).map(([id, slot]) => [
      id,
      Object.freeze({
        unlocked: Boolean(slot?.unlocked),
        ammo: Number.isFinite(slot?.ammo) ? Math.max(0, Math.floor(slot.ammo)) : Infinity,
      }),
    ]))),
    takenPickups: Object.freeze([...(state.takenPickups || [])]),
  });
}

export function pawnSlugRestoreSessionLoadout(state, loadout) {
  if (!state?.player || !loadout) return false;
  state.credits = loadout.credits;
  state.player.grenades = loadout.grenades;
  state.takenPickups = new Set(loadout.takenPickups || []);
  for (const [id, incoming] of Object.entries(loadout.arsenal || {})) {
    const slot = state.player.arsenal?.[id];
    if (!slot) continue;
    slot.unlocked = Boolean(incoming.unlocked);
    slot.ammo = incoming.ammo;
  }
  const preferred = state.player.arsenal?.[loadout.weapon];
  const canUsePreferred = Boolean(preferred?.unlocked && (loadout.weapon === 'pistol' || preferred.ammo > 0));
  state.player.weapon = canUsePreferred ? loadout.weapon : 'pistol';
  state.player.ammo = state.player.arsenal[state.player.weapon].ammo;
  return true;
}

export const PAWN_SLUG_SESSION_ARMORY_META = Object.freeze({
  purchaseWindow: 'between-missions-only',
  preservesAmmo: true,
  preservesUnlocks: true,
  preservesClaimedPickups: true,
  medkitShopDeferred: true,
});
