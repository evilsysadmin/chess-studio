import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_ENEMY_FIRE_MOTION_META,
  pawnSlugEnemyDidFire,
  pawnSlugEnemyFireMotion,
  pawnSlugEnemyRecoilStep,
} from './pawnSlugEnemyFireMotion.js';

describe('Pawn Slug enemy premium fire motion', () => {
  it('detects a shot only when a real prefire telegraph releases into cooldown', () => {
    expect(pawnSlugEnemyDidFire(0.9, 0, 0.8)).toBe(true);
    expect(pawnSlugEnemyDidFire(0.2, 0, 0.8)).toBe(false);
    expect(pawnSlugEnemyDidFire(0.9, 0.3, 0.8)).toBe(false);
    expect(pawnSlugEnemyDidFire(0.9, 0, 0)).toBe(false);
  });

  it('leans into the shot and then kicks visibly backwards', () => {
    const aim = pawnSlugEnemyFireMotion('pawn', 1, 0);
    const kick = pawnSlugEnemyFireMotion('pawn', 0, 1);
    expect(aim.x).toBeGreaterThan(0);
    expect(aim.rz).toBeLessThan(0);
    expect(kick.x).toBeLessThan(-0.1);
    expect(kick.rz).toBeGreaterThan(0.08);
    expect(kick.y).toBeGreaterThan(0);
  });

  it('gives assault troops a snappier kick and heavy troops more inertia', () => {
    const knight = pawnSlugEnemyFireMotion('knight', 0, 1);
    const rook = pawnSlugEnemyFireMotion('rook', 0, 1);
    expect(Math.abs(knight.x)).toBeGreaterThan(Math.abs(rook.x));
    expect(Math.abs(knight.rz)).toBeGreaterThan(Math.abs(rook.rz));
    expect(pawnSlugEnemyRecoilStep(1, 0.05, 'knight')).toBeLessThan(pawnSlugEnemyRecoilStep(1, 0.05, 'rook'));
  });

  it('keeps reduced-motion feedback readable without full-body kick', () => {
    const full = pawnSlugEnemyFireMotion('pawn', 1, 1);
    const reduced = pawnSlugEnemyFireMotion('pawn', 1, 1, { reducedMotion: true });
    expect(Math.abs(reduced.x)).toBeLessThan(Math.abs(full.x));
    expect(Math.abs(reduced.rz)).toBeLessThan(Math.abs(full.rz));
    expect(PAWN_SLUG_ENEMY_FIRE_MOTION_META.reducedMotionScale).toBe(0.35);
  });
});
