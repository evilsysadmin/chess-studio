import { describe, expect, it } from 'vitest';
import { PAWN_SLUG_ARCADE_PROJECTILES, pawnSlugArcadeProjectileProfile } from './pawnSlugArcadeProjectileProfile.js';

describe('Pawn Slug arcade projectile language', () => {
  it('keeps distinct visible silhouettes per weapon family', () => {
    expect(PAWN_SLUG_ARCADE_PROJECTILES.pistol.shape).toBe('slug');
    expect(PAWN_SLUG_ARCADE_PROJECTILES.machinegun.shape).toBe('needle');
    expect(PAWN_SLUG_ARCADE_PROJECTILES.shotgun.shape).toBe('pellet');
    expect(PAWN_SLUG_ARCADE_PROJECTILES.panzerfaust.shape).toBe('rocket');
    expect(PAWN_SLUG_ARCADE_PROJECTILES.enemy.shape).toBe('hostile-slug');
  });

  it('makes pistol bullets chunky and shotgun fire visibly multi-pellet', () => {
    const pistol = pawnSlugArcadeProjectileProfile({ weapon: 'pistol' });
    const machinegun = pawnSlugArcadeProjectileProfile({ weapon: 'machinegun' });
    const shotgun = pawnSlugArcadeProjectileProfile({ weapon: 'shotgun' });
    expect(pistol.radius).toBeGreaterThan(machinegun.radius);
    expect(shotgun.pellets).toBeGreaterThanOrEqual(5);
    expect(shotgun.spread).toBeGreaterThan(0);
  });

  it('uses the rocket profile for explosive rounds and hostile profile for enemy fire', () => {
    expect(pawnSlugArcadeProjectileProfile({ weapon: 'pistol', explosive: true })).toBe(PAWN_SLUG_ARCADE_PROJECTILES.panzerfaust);
    expect(pawnSlugArcadeProjectileProfile({ enemy: true })).toBe(PAWN_SLUG_ARCADE_PROJECTILES.enemy);
  });
});
