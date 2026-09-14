import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_EXPLOSION_ART_META,
  createExplosionParticle,
  pawnSlugExplosionParticleStyle,
} from './pawnSlugExplosionArt.js';


describe('Pawn Slug premium explosion art', () => {
  it('separates hot fragments from neutral smoke', () => {
    expect(pawnSlugExplosionParticleStyle(0xffdb6e)).toBe('ember');
    expect(pawnSlugExplosionParticleStyle(0xff7b37)).toBe('spark');
    expect(pawnSlugExplosionParticleStyle(0x5f6368)).toBe('smoke');
    expect(pawnSlugExplosionParticleStyle(0x8c9196)).toBe('smoke');
  });

  it('preserves the single-mesh opacity contract used by the runtime', () => {
    for (const color of [0xffdb6e, 0xff7b37, 0x5f6368]) {
      const particle = createExplosionParticle(color, 0.1);
      expect(particle.isMesh).toBe(true);
      expect(particle.material.opacity).toBeGreaterThan(0);
      expect(particle.userData.pawnSlugExplosionParticle).toBe(true);
      expect(particle.userData.dynamicLights).toBe(0);
    }
    expect(PAWN_SLUG_EXPLOSION_ART_META.runtimeContract).toBe('single-mesh-opacity-compatible');
  });

  it('shares geometry safely but never shares fade-mutated materials', () => {
    const first = createExplosionParticle(0xff7b37, 0.08);
    const second = createExplosionParticle(0xff7b37, 0.12);
    expect(first.geometry).toBe(second.geometry);
    expect(first.material).not.toBe(second.material);
    expect(first.geometry.userData.pawnSlugExplosionGeometry).toBe('shrapnel-smoke-v2');
    expect(PAWN_SLUG_EXPLOSION_ART_META.materials).toBe('per-particle-fade-safe');
  });

  it('uses distinct silhouettes for sparks, embers and smoke', () => {
    const spark = createExplosionParticle(0xff7b37, 0.1);
    const ember = createExplosionParticle(0xffdb6e, 0.1);
    const smoke = createExplosionParticle(0x5f6368, 0.1);
    expect(spark.userData.explosionStyle).toBe('spark');
    expect(ember.userData.explosionStyle).toBe('ember');
    expect(smoke.userData.explosionStyle).toBe('smoke');
    expect(spark.scale.y).toBeGreaterThan(spark.scale.x * 2);
    expect(smoke.scale.x).toBeGreaterThan(smoke.scale.y);
    expect(PAWN_SLUG_EXPLOSION_ART_META.dynamicLights).toBe(0);
  });
});
