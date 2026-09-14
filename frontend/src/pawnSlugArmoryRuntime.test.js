import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./pawnSlugThree.js', () => ({
  createPawnSlugGame: vi.fn(),
}));
vi.mock('./pawnSlugLiveWeaponModels.js', () => ({
  pawnSlugLiveWeaponLabel: (weaponId) => `label:${weaponId}`,
  pawnSlugLiveWeaponModel: (weaponId) => ({ id: `model:${weaponId}` }),
}));
vi.mock('./pawnSlugSfx.js', () => ({
  destroyPawnSlugPremiumSfx: vi.fn(),
}));
vi.mock('./pawnSlugWeaponModelArmory.js', () => ({
  pawnSlugBuyOrEquipWeaponModel: vi.fn(() => ({ ok: false, reason: 'test' })),
  pawnSlugWeaponModelOffers: vi.fn(() => []),
  refreshPawnSlugWeaponModelArmory: vi.fn(),
}));

import { pawnSlugRuntimeRpgEnabled } from './pawnSlug.js';
import { createPawnSlugGame } from './pawnSlugThree.js';
import { destroyPawnSlugPremiumSfx } from './pawnSlugSfx.js';
import {
  PAWN_SLUG_ARMORY_RUNTIME_META,
  createPawnSlugArmoryGame,
  createPawnSlugHudForwarder,
} from './pawnSlugArmoryRuntime.js';

describe('Pawn Slug armory runtime lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('owns the RPG policy for the lifetime of the runtime and restores the neutral default on destroy', () => {
    const engineDestroy = vi.fn();
    vi.mocked(createPawnSlugGame).mockReturnValue({ destroy: engineDestroy });

    const runtime = createPawnSlugArmoryGame({}, { expertMode: false });
    expect(pawnSlugRuntimeRpgEnabled()).toBe(false);
    expect(runtime.buyOrEquipWeaponModel('pistol', 'whatever')).toEqual({ ok: false, reason: 'expert-mode-disabled' });

    runtime.destroy();

    expect(pawnSlugRuntimeRpgEnabled()).toBe(true);
    expect(engineDestroy).toHaveBeenCalledTimes(1);
    expect(destroyPawnSlugPremiumSfx).toHaveBeenCalledTimes(1);
    expect(PAWN_SLUG_ARMORY_RUNTIME_META.expertModeOwnsEconomyAndRpg).toBe(true);
    expect(PAWN_SLUG_ARMORY_RUNTIME_META.premiumSfxLifecycle).toBe('destroy-with-runtime');
  });

  it('keeps RPG progression enabled for expert runs', () => {
    const engineDestroy = vi.fn();
    vi.mocked(createPawnSlugGame).mockReturnValue({ destroy: engineDestroy });

    const runtime = createPawnSlugArmoryGame({}, { expertMode: true });
    expect(pawnSlugRuntimeRpgEnabled()).toBe(true);
    runtime.destroy();
    expect(pawnSlugRuntimeRpgEnabled()).toBe(true);
  });

  it('still closes premium SFX and restores progression if the underlying Three runtime destroy throws', () => {
    const error = new Error('three cleanup failed');
    vi.mocked(createPawnSlugGame).mockReturnValue({
      destroy: vi.fn(() => { throw error; }),
    });

    const runtime = createPawnSlugArmoryGame({}, { expertMode: false });
    expect(pawnSlugRuntimeRpgEnabled()).toBe(false);

    expect(() => runtime.destroy()).toThrow(error);
    expect(pawnSlugRuntimeRpgEnabled()).toBe(true);
    expect(destroyPawnSlugPremiumSfx).toHaveBeenCalledTimes(1);
  });
});

describe('Pawn Slug HUD forwarding', () => {
  function hud(overrides = {}) {
    return {
      phase: 'playing',
      hp: 100,
      maxHp: 100,
      lives: 3,
      level: 1,
      weapon: 'machinegun',
      grenades: 4,
      toast: '',
      ammo: 30,
      progress: 0.2,
      score: 100,
      ...overrides,
    };
  }

  it('coalesces rapid ammo/progress updates and flushes the freshest HUD', () => {
    let now = 0;
    const scheduled = [];
    const delivered = [];
    const forwarder = createPawnSlugHudForwarder(
      (next) => delivered.push(next),
      (next) => next,
      {
        intervalMs: 80,
        now: () => now,
        schedule: (task, delay) => {
          scheduled.push({ task, delay });
          return scheduled.length;
        },
        cancel: vi.fn(),
      },
    );

    forwarder.forward(hud());
    now = 10;
    forwarder.forward(hud({ ammo: 29, progress: 0.21 }));
    now = 25;
    forwarder.forward(hud({ ammo: 28, progress: 0.23, score: 120 }));

    expect(delivered).toHaveLength(1);
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].delay).toBe(70);

    now = 80;
    scheduled[0].task();
    expect(delivered).toHaveLength(2);
    expect(delivered[1].ammo).toBe(28);
    expect(delivered[1].progress).toBe(0.23);
    expect(delivered[1].score).toBe(120);
  });

  it('forwards critical player state changes immediately', () => {
    let now = 0;
    const delivered = [];
    const forwarder = createPawnSlugHudForwarder(
      (next) => delivered.push(next),
      (next) => next,
      { intervalMs: 80, now: () => now },
    );

    forwarder.forward(hud());
    now = 12;
    forwarder.forward(hud({ hp: 72, ammo: 29 }));
    now = 20;
    forwarder.forward(hud({ hp: 72, weapon: 'pistol', ammo: null }));

    expect(delivered).toHaveLength(3);
    expect(delivered[1].hp).toBe(72);
    expect(delivered[2].weapon).toBe('pistol');
  });
});
