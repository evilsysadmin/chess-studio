import { describe, expect, it } from 'vitest';
import { PAWN_SLUG_WEAPON_MODELS, pawnSlugApplyWeaponModel } from './pawnSlugWeaponModels.js';

describe('Pawn Slug weapon model variants', () => {
  it('defines several models across all combat families', () => {
    expect(PAWN_SLUG_WEAPON_MODELS.pistol.map((model) => model.id)).toEqual(['glock17', 'dienstpistole', 'desert-eagle']);
    expect(PAWN_SLUG_WEAPON_MODELS.smg.map((model) => model.id)).toEqual(['mac10', 'uzi', 'mp5']);
    expect(PAWN_SLUG_WEAPON_MODELS.rifle.map((model) => model.id)).toEqual(['akm', 'm16a1', 'g3']);
    expect(PAWN_SLUG_WEAPON_MODELS.shotgun.map((model) => model.id)).toEqual(['m3-super90', 'm870', 'spas12']);
    expect(PAWN_SLUG_WEAPON_MODELS.machinegun.map((model) => model.id)).toEqual(['m249', 'mg42', 'rpk']);
    expect(PAWN_SLUG_WEAPON_MODELS.launcher.map((model) => model.id)).toEqual(['m79', 'rpg7', 'panzerfaust']);
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

  it('keeps representative variants distinct without invalidating their siblings', () => {
    const base = { damage: 20, cadence: 100, spread: 0.04, recoil: 1, capacity: 30, reload: 1, mobility: 1 };
    const mac = pawnSlugApplyWeaponModel(base, 'smg', 'mac10');
    const mp5 = pawnSlugApplyWeaponModel(base, 'smg', 'mp5');
    expect(mac.cadence).toBeLessThan(mp5.cadence);
    expect(mac.spread).toBeGreaterThan(mp5.spread);
    expect(mac.recoil).toBeGreaterThan(mp5.recoil);

    const akm = pawnSlugApplyWeaponModel(base, 'rifle', 'akm');
    const m16 = pawnSlugApplyWeaponModel(base, 'rifle', 'm16a1');
    expect(akm.damage).toBeGreaterThan(m16.damage);
    expect(akm.recoil).toBeGreaterThan(m16.recoil);
  });
});
