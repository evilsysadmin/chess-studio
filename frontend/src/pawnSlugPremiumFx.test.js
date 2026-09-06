import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_PROJECTILE_FX,
  animatePremiumMuzzleFlash,
  animatePremiumProjectile,
  createPremiumBulletModel,
  createPremiumMuzzleFlash,
} from './pawnSlugPremiumFx.js';

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
});
