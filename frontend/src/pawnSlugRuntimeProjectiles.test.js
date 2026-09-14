import { beforeEach, describe, expect, it, vi } from 'vitest';

const disposePawnSlugObject = vi.fn();
const animatePremiumProjectile = vi.fn();
const pawnSlugFirstHitDestructibleIndex = vi.fn();
const pawnSlugFirstHitEnemyIndex = vi.fn();
const pawnSlugRectsOverlap = vi.fn();

vi.mock('./pawnSlugArt.js', () => ({ disposePawnSlugObject }));
vi.mock('./pawnSlugPremiumFx.js', () => ({ animatePremiumProjectile }));
vi.mock('./pawnSlugRuntimeHotPath.js', () => ({
  pawnSlugFirstHitDestructibleIndex,
  pawnSlugFirstHitEnemyIndex,
  pawnSlugRectsOverlap,
}));

import { createPawnSlugProjectileSystem } from './pawnSlugRuntimeProjectiles.js';

function model() {
  return {
    position: { set: vi.fn() },
    rotation: { z: 0 },
  };
}

function runtime() {
  return {
    projectileLayer: { remove: vi.fn() },
    state: {
      time: 4,
      cameraX: 10,
      player: { x: 1, y: 0, crouch: false, level: 1 },
      enemies: [{ id: 'enemy-1' }],
      destructibles: [{ id: 'crate-1' }],
      bullets: [],
      grenades: [],
    },
  };
}

describe('Pawn Slug runtime projectiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pawnSlugRectsOverlap.mockReturnValue(false);
    pawnSlugFirstHitDestructibleIndex.mockReturnValue(-1);
    pawnSlugFirstHitEnemyIndex.mockReturnValue(-1);
  });

  it('routes a player bullet hit to combat damage and retires the projectile', () => {
    const ctx = runtime();
    const bulletModel = model();
    ctx.state.bullets.push({
      x: 2, y: 0.8, vx: 0, vy: 0, damage: 22, enemy: false, explosive: false,
      life: 1, weapon: 'pistol', w: 0.15, h: 0.12, model: bulletModel,
    });
    pawnSlugFirstHitEnemyIndex.mockReturnValue(0);
    const damageEnemy = vi.fn();
    const system = createPawnSlugProjectileSystem(ctx, { damageEnemy });

    system.updateBullets(0.016);

    expect(damageEnemy).toHaveBeenCalledWith(ctx.state.enemies[0], 22);
    expect(ctx.state.bullets).toHaveLength(0);
    expect(ctx.projectileLayer.remove).toHaveBeenCalledWith(bulletModel);
    expect(disposePawnSlugObject).toHaveBeenCalledWith(bulletModel);
    expect(animatePremiumProjectile).toHaveBeenCalledTimes(1);
  });

  it('routes an enemy bullet overlapping the player to player damage', () => {
    const ctx = runtime();
    const bulletModel = model();
    ctx.state.player.crouch = true;
    ctx.state.bullets.push({
      x: 1, y: 0.5, vx: 0, vy: 0, damage: 17, enemy: true, explosive: false,
      life: 1, weapon: 'machinegun', w: 0.15, h: 0.12, model: bulletModel,
    });
    pawnSlugRectsOverlap.mockReturnValue(true);
    const hurtPlayer = vi.fn();
    const system = createPawnSlugProjectileSystem(ctx, { hurtPlayer });

    system.updateBullets(0.016);

    expect(hurtPlayer).toHaveBeenCalledWith(17);
    expect(pawnSlugRectsOverlap).toHaveBeenCalledTimes(1);
    expect(ctx.state.bullets).toHaveLength(0);
  });

  it('detonates expired grenades and removes their visual exactly once', () => {
    const ctx = runtime();
    const grenadeModel = model();
    ctx.state.grenades.push({ x: 3, y: 0.12, vx: 0, vy: 0, fuse: 0, model: grenadeModel });
    const explode = vi.fn();
    const system = createPawnSlugProjectileSystem(ctx, { explode });

    system.updateGrenades(0);

    expect(explode).toHaveBeenCalledWith(3, 0.32, 2.65, expect.any(Number));
    expect(explode.mock.calls[0][3]).toBeGreaterThan(0);
    expect(ctx.state.grenades).toHaveLength(0);
    expect(ctx.projectileLayer.remove).toHaveBeenCalledWith(grenadeModel);
    expect(disposePawnSlugObject).toHaveBeenCalledWith(grenadeModel);
  });
});
