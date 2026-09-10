import { describe, expect, it } from 'vitest';
import { PAWN_SLUG_WEAPON_MODELS, pawnSlugApplyWeaponModel } from './pawnSlugWeaponModels.js';

describe('Pawn Slug weapon model variants', () => {
  it('defines several pistol and SMG models', () => {
    expect(PAWN_SLUG_WEAPON_MODELS.pistol.map((model) => model.id)).toEqual(['glock17', 'dienstpistole', 'desert-eagle']);
    expect(PAWN_SLUG_WEAPON_MODELS.smg.map((model) => model.id)).toEqual(['mac10', 'uzi', 'mp5']);
  });

  it('keeps same-family differences subtle rather than power-creeping', () => {
    for (const family of Object.values(PAWN_SLUG_WEAPON_MODELS)) {
      for (const model of family) {
        for (const key of ['damage', 'cadence', 'spread', 'recoil', 'capacity', 'reload', 'mobility']) {
          expect(model[key]).toBeGreaterThanOrEqual(0.8);
          expect(model[key]).toBeLessThanOrEqual(1.2);
        }
      }
    }
  });

  it('creates trade-offs instead of a universally best model', () => {
    const base = { damage: 20, cadence: 380, spread: 0.04, recoil: 1, capacity: 15, reload: 1, mobility: 1 };
    const glock = pawnSlugApplyWeaponModel(base, 'pistol', 'glock17');
    const deagle = pawnSlugApplyWeaponModel(base, 'pistol', 'desert-eagle');
    expect(deagle.damage).toBeGreaterThan(glock.damage);
    expect(deagle.cadence).toBeGreaterThan(glock.cadence);
    expect(deagle.recoil).toBeGreaterThan(glock.recoil);
    expect(deagle.capacity).toBeLessThan(glock.capacity);
  });
});
