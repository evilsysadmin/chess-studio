import { describe, expect, it } from 'vitest';
import {
  animatePawnSlugDestructibleModel,
  createPawnSlugDestructibleModel,
  PAWN_SLUG_DESTRUCTIBLE_ART_META,
} from './pawnSlugDestructibleArt.js';
import {
  PAWN_SLUG_DESTRUCTIBLE_LAYOUT,
  PAWN_SLUG_DESTRUCTIBLE_LAYOUT_META,
  pawnSlugDestructibleById,
  pawnSlugDestructiblesAhead,
} from './pawnSlugDestructibleLayout.js';

describe('Pawn Slug destructible art and layout', () => {
  it('builds readable wood and metal props with collision metadata', () => {
    const crate = createPawnSlugDestructibleModel('crate');
    const barrel = createPawnSlugDestructibleModel('barrel');
    expect(crate.userData).toMatchObject({ pawnSlugDestructible: true, destructibleType: 'crate', material: 'wood' });
    expect(barrel.userData).toMatchObject({ pawnSlugDestructible: true, destructibleType: 'barrel', material: 'metal' });
    expect(crate.userData.hitbox.width).toBeGreaterThan(barrel.userData.hitbox.width);
    expect(PAWN_SLUG_DESTRUCTIBLE_ART_META.damageFeedback).toContain('shake');
  });

  it('anchors damage shake to the original height instead of accumulating drift', () => {
    const crate = createPawnSlugDestructibleModel('crate');
    crate.position.y = 2.5;
    animatePawnSlugDestructibleModel(crate, 1.2, { hpRatio: 0.4 });
    const firstY = crate.position.y;
    animatePawnSlugDestructibleModel(crate, 1.2, { hpRatio: 0.4 });
    expect(crate.position.y).toBe(firstY);
    expect(crate.userData.baseY).toBe(2.5);
    animatePawnSlugDestructibleModel(crate, 2, { hpRatio: 0.4, reducedMotion: true });
    expect(crate.position.y).toBe(2.5);
    expect(crate.rotation.z).toBe(0);
  });

  it('uses unique authored placements across the active biomes', () => {
    const ids = PAWN_SLUG_DESTRUCTIBLE_LAYOUT.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(PAWN_SLUG_DESTRUCTIBLE_LAYOUT.map((entry) => entry.scenario))).toEqual(new Set([
      'fallen-forest',
      'gambit-ruins',
      'castle-dungeon',
      'fortress-approach',
    ]));
    expect(PAWN_SLUG_DESTRUCTIBLE_LAYOUT.some((entry) => entry.type === 'crate')).toBe(true);
    expect(PAWN_SLUG_DESTRUCTIBLE_LAYOUT.some((entry) => entry.type === 'barrel')).toBe(true);
    expect(PAWN_SLUG_DESTRUCTIBLE_LAYOUT.some((entry) => entry.secret)).toBe(true);
  });

  it('reveals placements only when the camera reaches them and excludes destroyed ids', () => {
    const first = PAWN_SLUG_DESTRUCTIBLE_LAYOUT[0];
    expect(pawnSlugDestructiblesAhead(first.x - 0.1)).toEqual([]);
    expect(pawnSlugDestructiblesAhead(first.x)).toContain(first);
    expect(pawnSlugDestructiblesAhead(999, new Set([first.id]))).not.toContain(first);
    expect(pawnSlugDestructibleById(first.id)).toBe(first);
  });

  it('keeps rewards coherent and sparse rather than loot-table driven', () => {
    expect(PAWN_SLUG_DESTRUCTIBLE_LAYOUT_META.placement).toBe('diegetic-biome-authored');
    expect(PAWN_SLUG_DESTRUCTIBLE_LAYOUT_META.secrets).toBe('sparse');
    for (const entry of PAWN_SLUG_DESTRUCTIBLE_LAYOUT) {
      expect(entry.reward).toBeTruthy();
      expect(entry.reward.credits ?? 0).toBeGreaterThanOrEqual(0);
      expect(entry.reward.grenades ?? 0).toBeGreaterThanOrEqual(0);
    }
  });
});
