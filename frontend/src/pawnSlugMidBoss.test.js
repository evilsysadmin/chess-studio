import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_STURM_BISHOP_META,
  animateSturmBishopModel,
  createSturmBishopModel,
} from './pawnSlugMidBoss.js';

describe('Pawn Slug Sturm-Bishop', () => {
  it('is a distinct armored mid-boss with two weapon mounts and a visor weak point', () => {
    expect(PAWN_SLUG_STURM_BISHOP_META.label).toBe('STURM-BISCHOF');
    expect(PAWN_SLUG_STURM_BISHOP_META.weaponMounts).toBe(2);
    expect(PAWN_SLUG_STURM_BISHOP_META.weakPoint).toBe('visor');

    const model = createSturmBishopModel();
    expect(model.userData.midBoss).toBe('sturm-bishop');
    expect(model.children.length).toBeGreaterThanOrEqual(10);
    let weakPoints = 0;
    model.traverse((node) => {
      if (node.userData?.weakPoint) weakPoints += 1;
    });
    expect(weakPoints).toBe(1);
  });

  it('keeps its premium scale while animating movement and damage feedback', () => {
    const model = createSturmBishopModel();
    const base = model.userData.baseScale;
    animateSturmBishopModel(model, 0.8, { moving: true, hurt: false, dir: -1 });
    expect(Math.abs(model.scale.x)).toBeCloseTo(base);
    expect(model.scale.z).toBeCloseTo(base);

    animateSturmBishopModel(model, 1.1, { moving: false, hurt: true, dir: 1 });
    expect(model.scale.x).toBeGreaterThan(0);
    expect(model.scale.y).toBeLessThan(base * 1.02);
  });
});
