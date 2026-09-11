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

  it('gives hostile rounds a larger unmistakable tracer without changing explosive identity', () => {
    const hostile = pawnSlugArcadeProjectileProfile({ weapon: 'pistol', enemy: true });
    const friendly = pawnSlugArcadeProjectileProfile({ weapon: 'pistol' });
    expect(hostile).toBe(PAWN_SLUG_ARCADE_PROJECTILES.enemy);
    expect(hostile.shape).toBe('needle');
    expect(hostile.trail).toBeGreaterThan(friendly.trail);
    expect(hostile.length).toBeGreaterThan(friendly.length);
    expect(pawnSlugArcadeProjectileProfile({ weapon: 'pistol', enemy: true, explosive: true })).toBe(PAWN_SLUG_ARCADE_PROJECTILES.panzerfaust);
  });
});
