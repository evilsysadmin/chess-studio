import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./pawnSlugThree.js', () => ({
  createPawnSlugGame: vi.fn(),
}));
vi.mock('./pawnSlugLiveWeaponModels.js', () => ({
  pawnSlugLiveWeaponLabel: (weaponId) => `label:${weaponId}`,
  pawnSlugLiveWeaponModel: (weaponId) => ({ id: `model:${weaponId}` }),
}));
vi.mock('./pawnSlugSfx.js', () => ({ destroyPawnSlugPremiumSfx: vi.fn() }));
vi.mock('./pawnSlugWeaponModelArmory.js', () => ({
  pawnSlugBuyOrEquipWeaponModel: vi.fn(() => ({ ok: false, reason: 'test' })),
  pawnSlugWeaponModelOffers: vi.fn(() => []),
  refreshPawnSlugWeaponModelArmory: vi.fn(),
}));

import { createPawnSlugGame } from './pawnSlugThree.js';
import { createPawnSlugArmoryGame } from './pawnSlugArmoryRuntime.js';

describe('Pawn Slug render-state bridge', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mirrors phase and pause into the render host and clears them on destroy', () => {
    let engineOptions = null;
    const engineSetPaused = vi.fn();
    const engineDestroy = vi.fn();
    vi.mocked(createPawnSlugGame).mockImplementation((host, options) => {
      engineOptions = options;
      return { setPaused: engineSetPaused, destroy: engineDestroy };
    });

    const host = { dataset: {} };
    const runtime = createPawnSlugArmoryGame(host);
    expect(host.dataset.pawnSlugPaused).toBe('false');

    engineOptions.onHud({ phase: 'ready', hp: 100, maxHp: 100, lives: 3, level: 1, weapon: 'pistol', grenades: 4, weapons: [] });
    expect(host.dataset.pawnSlugPhase).toBe('ready');

    runtime.setPaused(true);
    expect(host.dataset.pawnSlugPaused).toBe('true');
    expect(engineSetPaused).toHaveBeenCalledWith(true);

    engineOptions.onHud({ phase: 'playing', hp: 100, maxHp: 100, lives: 3, level: 1, weapon: 'pistol', grenades: 4, weapons: [] });
    expect(host.dataset.pawnSlugPhase).toBe('playing');

    runtime.destroy();
    expect(engineDestroy).toHaveBeenCalledTimes(1);
    expect(host.dataset.pawnSlugPaused).toBeUndefined();
    expect(host.dataset.pawnSlugPhase).toBeUndefined();
  });
});
