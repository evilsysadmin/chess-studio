import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  installPawnSlugEnemyDeathReplay,
  pawnSlugEnemyDeathGroundLift,
} from './pawnSlugEnemyDeathReplay.js';

describe('Pawn Slug grounded enemy deaths', () => {
  it('adds enough lift as a corpse rotates toward the floor', () => {
    expect(pawnSlugEnemyDeathGroundLift(2, 0)).toBe(0);
    expect(pawnSlugEnemyDeathGroundLift(2, Math.PI / 2)).toBeCloseTo(0.76, 6);
    expect(pawnSlugEnemyDeathGroundLift(-2, -Math.PI / 2)).toBeCloseTo(0.76, 6);
  });

  it('never lets the death replay sink its sprite anchor below the support plane', () => {
    const parent = new THREE.Group();
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial());
    sprite.userData.motionBaseScaleX = 2;
    sprite.scale.set(2, 2, 1);
    parent.add(sprite);
    let clock = 1000;
    let queued = null;
    const replay = installPawnSlugEnemyDeathReplay(sprite, {
      animate: vi.fn(() => {
        sprite.position.y -= 0.45;
        sprite.material.rotation = Math.PI / 2;
      }),
      now: () => clock,
      raf: (callback) => { queued = callback; return 1; },
      cancel: vi.fn(),
    });

    sprite.visible = false;
    parent.remove(sprite);
    clock += 100;
    queued?.(clock);

    expect(replay.active).toBe(true);
    expect(sprite.position.y).toBeGreaterThan(0);
    expect(sprite.position.y).toBeCloseTo(0.76, 6);
  });
});
