import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_SESSION_ARMORY_META,
  pawnSlugArmoryOffersForGame,
  pawnSlugArmoryStateFromGame,
  pawnSlugBuyArmoryItemForGame,
  pawnSlugCaptureSessionLoadout,
  pawnSlugRestoreSessionLoadout,
} from './pawnSlugSessionArmory.js';

function gameState({ phase = 'gameover', credits = 200 } = {}) {
  return {
    phase,
    credits,
    takenPickups: new Set([1, 4]),
    player: {
      grenades: 2,
      weapon: 'machinegun',
      ammo: 12,
      arsenal: {
        pistol: { unlocked: true, ammo: Infinity },
        machinegun: { unlocked: true, ammo: 12 },
        shotgun: { unlocked: false, ammo: 0 },
        panzerfaust: { unlocked: false, ammo: 0 },
      },
    },
  };
}

describe('Pawn Slug persistent session armory', () => {
  it('derives the existing armory economy from live game state', () => {
    const state = pawnSlugArmoryStateFromGame(gameState());
    expect(state).toMatchObject({ credits: 200, grenades: 2 });
    expect(state.weapons.machinegun).toEqual({ unlocked: true, ammo: 12 });
    expect(pawnSlugArmoryOffersForGame(gameState()).some((entry) => entry.id === 'medkit')).toBe(false);
  });

  it('buys between missions and refuses purchases during combat', () => {
    const state = gameState();
    const result = pawnSlugBuyArmoryItemForGame(state, 'shotgun');
    expect(result.ok).toBe(true);
    expect(state.credits).toBe(80);
    expect(state.player.arsenal.shotgun.unlocked).toBe(true);
    expect(state.player.arsenal.shotgun.ammo).toBe(42);

    const active = gameState({ phase: 'playing' });
    expect(pawnSlugBuyArmoryItemForGame(active, 'shotgun')).toEqual({ ok: false, reason: 'mission-active' });
    expect(active.credits).toBe(200);
  });

  it('captures and restores ammo, unlocks, grenades, weapon and claimed pickups', () => {
    const original = gameState();
    const bank = pawnSlugCaptureSessionLoadout(original);
    const fresh = gameState({ credits: 0 });
    fresh.takenPickups = new Set();
    fresh.player.grenades = 4;
    fresh.player.weapon = 'pistol';
    fresh.player.ammo = Infinity;
    fresh.player.arsenal.machinegun = { unlocked: false, ammo: 0 };

    expect(pawnSlugRestoreSessionLoadout(fresh, bank)).toBe(true);
    expect(fresh.credits).toBe(200);
    expect(fresh.player.grenades).toBe(2);
    expect(fresh.player.weapon).toBe('machinegun');
    expect(fresh.player.ammo).toBe(12);
    expect(fresh.player.arsenal.machinegun).toEqual({ unlocked: true, ammo: 12 });
    expect([...fresh.takenPickups]).toEqual([1, 4]);
    expect(PAWN_SLUG_SESSION_ARMORY_META.preservesClaimedPickups).toBe(true);
  });

  it('falls back to pistol when the previously selected weapon has no usable ammo', () => {
    const original = gameState();
    original.player.arsenal.machinegun.ammo = 0;
    original.player.ammo = 0;
    const bank = pawnSlugCaptureSessionLoadout(original);
    const fresh = gameState({ credits: 0 });
    expect(pawnSlugRestoreSessionLoadout(fresh, bank)).toBe(true);
    expect(fresh.player.weapon).toBe('pistol');
    expect(fresh.player.ammo).toBe(Infinity);
  });
});
