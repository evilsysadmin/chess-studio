import { describe, expect, it } from 'vitest';
import { PAWN_SLUG_ARCADE_PROJECTILES, pawnSlugArcadeProjectileProfile } from './pawnSlugArcadeProjectileProfile.js';

describe('Pawn Slug arcade projectile language', () => {
  it('keeps distinct visible silhouettes per weapon family', () => {
    expect(PAWN_SLUG_ARCADE_PROJECTILES.pistol.shape).toBe('slug');
    expect(PAWN_SLUG_ARCADE_PROJECTILES.machinegun.shape).toBe('needle');
    expect(PAWN_SLUG_ARCADE_PROJECTILES.shotgun.shape).toBe('pellet');
    expect(PAWN_SLUG_ARCADE_PROJECTILES.panzerfaust.shape).toBe('rocket');
  });

  it('makes pistol bullets chunky and shotgun fire visibly multi-pellet', () => {
    const pistol = pawnSlugArcadeProjectileProfile({ weapon: 'pistol' });
    const machinegun = pawnSlugArcadeProjectileProfile({ weapon: 'machinegun' });
    const shotgun = pawnSlugArcadeProjectileProfile({ weapon: 'shotgun' });
    expect(pistol.radius).toBeGreaterThan(machinegun.radius);
    expect(shotgun.pellets).toBeGreaterThanOrEqual(5);
    expect(shotgun.spread).toBeGreaterThan(0);
  });

  it('gives hostile rounds a larger unmistakable tracer', () => {
    const hostile = pawnSlugArcadeProjectileProfile({ weapon: 'pistol', enemy: true });
    const friendly = pawnSlugArcadeProjectileProfile({ weapon: 'pistol' });
    expect(hostile).toBe(PAWN_SLUG_ARCADE_PROJECTILES.enemy);
    expect(hostile.shape).toBe('needle');
    expect(hostile.trail).toBeGreaterThan(friendly.trail);
    expect(hostile.length).toBeGreaterThan(friendly.length);
  });

  it('makes hostile rockets visually heavier without changing rocket identity', () => {
    const friendly = pawnSlugArcadeProjectileProfile({ weapon: 'pistol', explosive: true });
    const hostile = pawnSlugArcadeProjectileProfile({ weapon: 'pistol', enemy: true, explosive: true });
    expect(friendly).toBe(PAWN_SLUG_ARCADE_PROJECTILES.panzerfaust);
    expect(hostile).toBe(PAWN_SLUG_ARCADE_PROJECTILES.enemyPanzerfaust);
    expect(hostile.shape).toBe('rocket');
    expect(hostile.length).toBeGreaterThan(friendly.length);
    expect(hostile.radius).toBeGreaterThan(friendly.radius);
    expect(hostile.trail).toBeGreaterThan(friendly.trail);
  });
});
