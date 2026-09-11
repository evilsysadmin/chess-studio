import { describe, expect, it } from 'vitest';
import {
  animatePawnSlugDestructibleModel,
  createPawnSlugDestructibleModel,
  PAWN_SLUG_DESTRUCTIBLE_ART_META,
  pawnSlugDestructibleDamageStage,
} from './pawnSlugDestructibleArt.js';
import {
  PAWN_SLUG_DESTRUCTIBLE_LAYOUT,
  PAWN_SLUG_DESTRUCTIBLE_LAYOUT_META,
  pawnSlugDestructibleById,
  pawnSlugDestructiblesAhead,
} from './pawnSlugDestructibleLayout.js';

describe('Pawn Slug destructible art and layout', () => {
  it('builds readable wood, metal and fabric props with collision metadata', () => {
    const crate = createPawnSlugDestructibleModel('crate');
    const barrel = createPawnSlugDestructibleModel('barrel');
    const sandbags = createPawnSlugDestructibleModel('sandbags');
    expect(crate.userData).toMatchObject({ pawnSlugDestructible: true, destructibleType: 'crate', material: 'wood', damageStage: 'intact' });
    expect(barrel.userData).toMatchObject({ pawnSlugDestructible: true, destructibleType: 'barrel', material: 'metal', damageStage: 'intact' });
    expect(sandbags.userData).toMatchObject({ pawnSlugDestructible: true, destructibleType: 'sandbags', material: 'fabric', damageStage: 'intact' });
    expect(crate.userData.hitbox.width).toBeGreaterThan(barrel.userData.hitbox.width);
    expect(sandbags.userData.hitbox.width).toBeGreaterThan(crate.userData.hitbox.width);
    expect(sandbags.children.filter((node) => node.userData.sandbag)).toHaveLength(5);
    expect(PAWN_SLUG_DESTRUCTIBLE_ART_META.damageFeedback).toContain('material-state');
  });

  it('uses stable intact, damaged and critical visual states', () => {
    expect(pawnSlugDestructibleDamageStage(1)).toBe('intact');
    expect(pawnSlugDestructibleDamageStage(0.66)).toBe('damaged');
    expect(pawnSlugDestructibleDamageStage(0.33)).toBe('critical');
    expect(PAWN_SLUG_DESTRUCTIBLE_ART_META.damageStages).toEqual(['intact', 'damaged', 'critical']);

    const barrel = createPawnSlugDestructibleModel('barrel');
    animatePawnSlugDestructibleModel(barrel, 0.4, { hpRatio: 0.2, reducedMotion: true });
    expect(barrel.userData.damageStage).toBe('critical');
    const emissive = [];
    barrel.traverse((node) => {
      if (node.isMesh && node.material?.emissive) emissive.push(node.material.emissiveIntensity);
    });
    expect(emissive.some((value) => value > 0)).toBe(true);
  });

  it('darkens damaged fabric without giving it metal heat glow', () => {
    const sandbags = createPawnSlugDestructibleModel('sandbags');
    animatePawnSlugDestructibleModel(sandbags, 0.7, { hpRatio: 0.2, reducedMotion: true });
    expect(sandbags.userData.damageStage).toBe('critical');
    const emissive = [];
    sandbags.traverse((node) => {
      if (node.isMesh && node.material?.emissive) emissive.push(node.material.emissiveIntensity);
    });
    expect(emissive.every((value) => value === 0)).toBe(true);
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
    expect(crate.userData.damageStage).toBe('damaged');
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
    expect(PAWN_SLUG_DESTRUCTIBLE_LAYOUT.filter((entry) => entry.type === 'sandbags')).toHaveLength(2);
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
    expect(PAWN_SLUG_DESTRUCTIBLE_LAYOUT.find((entry) => entry.id === 'forest-sandbags')?.reward).toEqual({ ammo: undefined });
  });
});
