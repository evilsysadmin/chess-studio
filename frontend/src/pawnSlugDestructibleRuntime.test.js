import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_DESTRUCTIBLE_RUNTIME_META,
  pawnSlugApplyDestructibleReward,
  pawnSlugDamageRuntimeDestructible,
  pawnSlugFirstHitDestructibleIndex,
  pawnSlugRetireDestroyedDestructibles,
  pawnSlugSpawnDestructiblesAhead,
} from './pawnSlugDestructibleRuntime.js';

describe('Pawn Slug live destructible runtime', () => {
  it('spawns authored props once when the camera reaches them', () => {
    const active = [];
    const added = [];
    const first = pawnSlugSpawnDestructiblesAhead({
      rightEdge: 16.2,
      active,
      addModel: (model) => added.push(model),
      resolveY: () => 1.25,
    });
    expect(first).toHaveLength(1);
    expect(active[0]).toMatchObject({ id: 'forest-cache', type: 'crate', x: 16.2, y: 1.25 });
    expect(added).toHaveLength(1);
    expect(pawnSlugSpawnDestructiblesAhead({ rightEdge: 16.2, active })).toHaveLength(0);
  });

  it('uses scalar AABB collision and ignores destroyed props', () => {
    const active = [];
    pawnSlugSpawnDestructiblesAhead({ rightEdge: 16.2, active });
    const item = active[0];
    expect(pawnSlugFirstHitDestructibleIndex(active, item.x - 0.1, 0.1, 0.2, 0.2)).toBe(0);
    item.destroyed = true;
    expect(pawnSlugFirstHitDestructibleIndex(active, item.x - 0.1, 0.1, 0.2, 0.2)).toBe(-1);
  });

  it('breaks a crate once and claims its configured reward once', () => {
    const active = [];
    pawnSlugSpawnDestructiblesAhead({ rightEdge: 16.2, active });
    const item = active[0];
    const result = pawnSlugDamageRuntimeDestructible(item, 999);
    expect(result).toMatchObject({ destroyedNow: true, explosion: null, score: 60, reward: { credits: 14 } });
    expect(pawnSlugDamageRuntimeDestructible(item, 999).reward).toBeNull();
  });

  it('returns one bounded barrel explosion', () => {
    const active = [];
    pawnSlugSpawnDestructiblesAhead({ rightEdge: 25.2, active });
    const barrel = active.find((item) => item.id === 'forest-barrel');
    const result = pawnSlugDamageRuntimeDestructible(barrel, 999);
    expect(result.explosion).toEqual({ radius: 2.4, damage: 72 });
    expect(pawnSlugDamageRuntimeDestructible(barrel, 999).explosion).toBeNull();
  });

  it('applies physical rewards and unlocks ammo slots without inventing resources', () => {
    const state = {
      credits: 5,
      player: {
        grenades: 1,
        weapon: 'shotgun',
        ammo: 0,
        arsenal: {
          shotgun: { unlocked: false, ammo: 0 },
        },
      },
    };
    expect(pawnSlugApplyDestructibleReward({ credits: 8, grenades: 2, ammo: { shotgun: 6 } }, state)).toBe(true);
    expect(state).toMatchObject({
      credits: 13,
      player: {
        grenades: 3,
        ammo: 6,
        arsenal: { shotgun: { unlocked: true, ammo: 6 } },
      },
    });
  });

  it('retires destroyed props and remembers them for the mission', () => {
    const active = [];
    const destroyedIds = new Set();
    const removed = [];
    pawnSlugSpawnDestructiblesAhead({ rightEdge: 16.2, active });
    active[0].destroyed = true;
    pawnSlugRetireDestroyedDestructibles(active, destroyedIds, (model) => removed.push(model));
    expect(active).toEqual([]);
    expect(destroyedIds.has('forest-cache')).toBe(true);
    expect(removed).toHaveLength(1);
    expect(pawnSlugSpawnDestructiblesAhead({ rightEdge: 16.2, active, destroyedIds })).toEqual([]);
    expect(PAWN_SLUG_DESTRUCTIBLE_RUNTIME_META.reward).toBe('one-shot');
  });
});
