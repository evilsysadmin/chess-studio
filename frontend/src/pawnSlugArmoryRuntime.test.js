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
import { PAWN_SLUG_ARMORY_RUNTIME_META, createPawnSlugArmoryGame } from './pawnSlugArmoryRuntime.js';

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
