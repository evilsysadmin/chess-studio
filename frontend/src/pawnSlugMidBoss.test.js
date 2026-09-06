import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_STURM_BISHOP_META,
  animateSturmBishopModel,
  createSturmBishopModel,
  pawnSlugSturmBishopTelegraph,
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
    let telegraphMuzzles = 0;
    model.traverse((node) => {
      if (node.userData?.weakPoint) weakPoints += 1;
      if (node.userData?.shellTelegraph) telegraphMuzzles += 1;
    });
    expect(weakPoints).toBe(1);
    expect(telegraphMuzzles).toBe(PAWN_SLUG_STURM_BISHOP_META.weaponMounts);
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

  it('telegraphs the heavy shell only inside range and during the final charge window', () => {
    const window = PAWN_SLUG_STURM_BISHOP_META.shellTelegraphSeconds;
    expect(window).toBeGreaterThanOrEqual(0.45);
    expect(pawnSlugSturmBishopTelegraph(window + 0.1, 8)).toBe(0);
    expect(pawnSlugSturmBishopTelegraph(window * 0.5, 8)).toBeCloseTo(0.5);
    expect(pawnSlugSturmBishopTelegraph(0, 8)).toBe(1);
    expect(pawnSlugSturmBishopTelegraph(0.1, PAWN_SLUG_STURM_BISHOP_META.shellRange + 0.1)).toBe(0);
  });

  it('lights both weapon mounts during a full warning pulse without disturbing model scale', () => {
    const model = createSturmBishopModel();
    const base = model.userData.baseScale;
    animateSturmBishopModel(model, 0.42, { moving: false, hurt: false, dir: -1, telegraph: 1 });
    const intensities = [];
    model.traverse((node) => {
      if (node.userData?.shellTelegraph) intensities.push(node.material.emissiveIntensity);
    });
    expect(intensities).toHaveLength(PAWN_SLUG_STURM_BISHOP_META.weaponMounts);
    expect(intensities.every((value) => value > 0)).toBe(true);
    expect(Math.abs(model.scale.x)).toBeCloseTo(base);
  });
});