import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PAWN_SLUG_FX_RESOURCE_VERSION,
  createBulletModel,
  createExplosionParticle,
  createGrenadeModel,
  createMuzzleFlash,
  disposePawnSlugObject,
} from './pawnSlugArt.js';

afterEach(() => vi.restoreAllMocks());

describe('Pawn Slug transient FX hot path', () => {
  it('reuses bullet and rocket geometry/material instead of rebuilding GPU resources per shot', () => {
    const bulletA = createBulletModel();
    const bulletB = createBulletModel();
    expect(bulletA.geometry).toBe(bulletB.geometry);
    expect(bulletA.material).toBe(bulletB.material);
    expect(bulletA.geometry.userData.pawnSlugSharedFx).toBe(PAWN_SLUG_FX_RESOURCE_VERSION);
    expect(bulletA.material.userData.pawnSlugSharedFx).toBe(PAWN_SLUG_FX_RESOURCE_VERSION);

    const rocketA = createBulletModel({ explosive: true });
    const rocketB = createBulletModel({ explosive: true });
    expect(rocketA.children[0].geometry).toBe(rocketB.children[0].geometry);
    expect(rocketA.children[0].material).toBe(rocketB.children[0].material);
    expect(rocketA.children[1].geometry).toBe(rocketB.children[1].geometry);
    expect(rocketA.children[1].material).toBe(rocketB.children[1].material);
  });

  it('reuses grenade and muzzle-flash resources while keeping each object transform independent', () => {
    const grenadeA = createGrenadeModel();
    const grenadeB = createGrenadeModel();
    expect(grenadeA.children[0].geometry).toBe(grenadeB.children[0].geometry);
    expect(grenadeA.children[0].material).toBe(grenadeB.children[0].material);
    expect(grenadeA.children[1].geometry).toBe(grenadeB.children[1].geometry);

    const flashA = createMuzzleFlash();
    const flashB = createMuzzleFlash();
    expect(flashA.children[0].geometry).toBe(flashB.children[0].geometry);
    expect(flashA.children[0].material).toBe(flashB.children[0].material);
    expect(flashA.children[1].geometry).toBe(flashB.children[1].geometry);
    expect(flashA.children[1].material).toBe(flashB.children[1].material);

    flashA.scale.setScalar(2);
    expect(flashB.scale.x).toBe(1);
  });

  it('shares particle geometry but keeps fadeable particle materials independent', () => {
    const particleA = createExplosionParticle(0xffa43c, 0.08);
    const particleB = createExplosionParticle(0xff7b37, 0.16);
    expect(particleA.geometry).toBe(particleB.geometry);
    expect(particleA.material).not.toBe(particleB.material);
    expect(particleA.scale.x).toBeCloseTo(0.08, 8);
    expect(particleB.scale.x).toBeCloseTo(0.16, 8);

    const geometryDispose = vi.spyOn(particleA.geometry, 'dispose');
    const materialDispose = vi.spyOn(particleA.material, 'dispose');
    disposePawnSlugObject(particleA);
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).toHaveBeenCalledTimes(1);
  });

  it('does not dispose shared bullet resources when a projectile expires', () => {
    const bullet = createBulletModel();
    const geometryDispose = vi.spyOn(bullet.geometry, 'dispose');
    const materialDispose = vi.spyOn(bullet.material, 'dispose');
    disposePawnSlugObject(bullet);
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();
  });
});
