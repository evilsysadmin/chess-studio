import { afterEach, describe, expect, it, vi } from 'vitest';
import { disposePawnSlugObject } from './pawnSlugArt.js';
import {
  PAWN_SLUG_PREMIUM_FX_RESOURCE_VERSION,
  PAWN_SLUG_PROJECTILE_FX,
  animatePremiumMuzzleFlash,
  animatePremiumProjectile,
  createPremiumBulletModel,
  createPremiumMuzzleFlash,
} from './pawnSlugPremiumFx.js';

afterEach(() => vi.restoreAllMocks());

describe('Pawn Slug premium projectile FX', () => {
  it('gives every weapon a distinct projectile silhouette and muzzle weight', () => {
    expect(PAWN_SLUG_PROJECTILE_FX.machinegun.length).toBeGreaterThan(PAWN_SLUG_PROJECTILE_FX.pistol.length);
    expect(PAWN_SLUG_PROJECTILE_FX.shotgun.flash).toBeGreaterThan(PAWN_SLUG_PROJECTILE_FX.pistol.flash);
    expect(PAWN_SLUG_PROJECTILE_FX.panzerfaust.flash).toBeGreaterThan(PAWN_SLUG_PROJECTILE_FX.shotgun.flash);
    expect(PAWN_SLUG_PROJECTILE_FX.enemy.tracer).not.toBe(PAWN_SLUG_PROJECTILE_FX.pistol.tracer);
  });

  it('builds tracer projectiles instead of a single popcorn sphere', () => {
    const projectile = createPremiumBulletModel({ weapon: 'machinegun' });
    expect(projectile.userData.premiumProjectile).toBe(true);
    expect(projectile.userData.weapon).toBe('machinegun');
    expect(projectile.children.length).toBeGreaterThanOrEqual(2);
    expect(projectile.children.some((child) => child.userData.projectileGlow)).toBe(true);
    expect(() => animatePremiumProjectile(projectile, { time: 0.5 })).not.toThrow();
  });

  it('gives rockets a body, tip and exhaust and muzzle flashes a finite life', () => {
    const rocket = createPremiumBulletModel({ weapon: 'panzerfaust', explosive: true });
    expect(rocket.userData.explosive).toBe(true);
    expect(rocket.children.length).toBeGreaterThanOrEqual(3);
    expect(rocket.children.some((child) => child.userData.projectileGlow)).toBe(true);

    const flash = createPremiumMuzzleFlash({ weapon: 'panzerfaust' });
    expect(flash.userData.premiumMuzzle).toBe(true);
    expect(flash.userData.life).toBeGreaterThan(0.08);
    expect(flash.children.length).toBeGreaterThanOrEqual(4);
    expect(() => animatePremiumMuzzleFlash(flash, 0.5)).not.toThrow();
  });

  it('reuses premium projectile geometry and materials per weapon', () => {
    const first = createPremiumBulletModel({ weapon: 'machinegun' });
    const second = createPremiumBulletModel({ weapon: 'machinegun' });
    expect(first.children[0].geometry).toBe(second.children[0].geometry);
    expect(first.children[0].material).toBe(second.children[0].material);
    expect(first.children[1].geometry).toBe(second.children[1].geometry);
    expect(first.children[1].material).toBe(second.children[1].material);
    expect(first.userData.premiumFxResources).toBe(PAWN_SLUG_PREMIUM_FX_RESOURCE_VERSION);

    const geometryDispose = vi.spyOn(first.children[0].geometry, 'dispose');
    const materialDispose = vi.spyOn(first.children[0].material, 'dispose');
    disposePawnSlugObject(first);
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();
  });

  it('shares muzzle geometry but keeps fade materials isolated between overlapping flashes', () => {
    const first = createPremiumMuzzleFlash({ weapon: 'machinegun' });
    const second = createPremiumMuzzleFlash({ weapon: 'machinegun' });
    expect(first.children[0].geometry).toBe(second.children[0].geometry);
    expect(first.children[1].geometry).toBe(second.children[1].geometry);
    expect(first.children[2].geometry).toBe(second.children[2].geometry);
    expect(first.children[0].material).not.toBe(second.children[0].material);
    expect(first.children[1].material).not.toBe(second.children[1].material);

    animatePremiumMuzzleFlash(first, 0.2);
    animatePremiumMuzzleFlash(second, 0.8);
    expect(first.children[0].material.opacity).not.toBe(second.children[0].material.opacity);

    const geometryDispose = vi.spyOn(first.children[0].geometry, 'dispose');
    const materialDispose = vi.spyOn(first.children[0].material, 'dispose');
    disposePawnSlugObject(first);
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).toHaveBeenCalledTimes(1);
  });
});