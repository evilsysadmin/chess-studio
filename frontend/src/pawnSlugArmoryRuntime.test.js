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

import { createPawnSlugGame } from './pawnSlugThree.js';
import { destroyPawnSlugPremiumSfx } from './pawnSlugSfx.js';
import { PAWN_SLUG_ARMORY_RUNTIME_META, createPawnSlugArmoryGame } from './pawnSlugArmoryRuntime.js';

describe('Pawn Slug armory runtime lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('destroys premium SFX with the runtime', () => {
    const engineDestroy = vi.fn();
    vi.mocked(createPawnSlugGame).mockReturnValue({ destroy: engineDestroy });

    const runtime = createPawnSlugArmoryGame({});
    runtime.destroy();

    expect(engineDestroy).toHaveBeenCalledTimes(1);
    expect(destroyPawnSlugPremiumSfx).toHaveBeenCalledTimes(1);
    expect(PAWN_SLUG_ARMORY_RUNTIME_META.premiumSfxLifecycle).toBe('destroy-with-runtime');
  });

  it('still closes premium SFX if the underlying Three runtime destroy throws', () => {
    const error = new Error('three cleanup failed');
    vi.mocked(createPawnSlugGame).mockReturnValue({
      destroy: vi.fn(() => { throw error; }),
    });

    const runtime = createPawnSlugArmoryGame({});

    expect(() => runtime.destroy()).toThrow(error);
    expect(destroyPawnSlugPremiumSfx).toHaveBeenCalledTimes(1);
  });
});
