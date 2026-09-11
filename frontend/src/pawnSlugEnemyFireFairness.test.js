import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_ENEMY_FIRE_FAIRNESS,
  pawnSlugEnemyCombatVisible,
  pawnSlugEnemyFireReadiness,
} from './pawnSlugEnemyFireFairness.js';

describe('Pawn Slug enemy fire fairness', () => {
  it('keeps normal enemy fire inside the readable combat viewport', () => {
    expect(pawnSlugEnemyCombatVisible(0, 0, 20)).toBe(true);
    expect(pawnSlugEnemyCombatVisible(9.8, 0, 20)).toBe(false);
    expect(pawnSlugEnemyCombatVisible(-9.8, 0, 20)).toBe(false);
  });

  it('adds a brief arming delay when an enemy first becomes visible', () => {
    const result = pawnSlugEnemyFireReadiness({
      enemyX: 5,
      cameraX: 0,
      viewWidth: 20,
      wasVisible: false,
      cooldown: -1,
    });
    expect(result.visible).toBe(true);
    expect(result.canFire).toBe(false);
    expect(result.cooldown).toBe(PAWN_SLUG_ENEMY_FIRE_FAIRNESS.entryArmSeconds);
  });

  it('does not disturb the regular cadence after the enemy is established on screen', () => {
    const ready = pawnSlugEnemyFireReadiness({ enemyX: 5, cameraX: 0, viewWidth: 20, wasVisible: true, cooldown: -0.1 });
    expect(ready.visible).toBe(true);
    expect(ready.canFire).toBe(true);
    expect(ready.cooldown).toBe(-0.1);
  });

  it('never authorizes fire while off screen', () => {
    const result = pawnSlugEnemyFireReadiness({ enemyX: 14, cameraX: 0, viewWidth: 20, wasVisible: true, cooldown: -2 });
    expect(result.visible).toBe(false);
    expect(result.canFire).toBe(false);
  });
});
