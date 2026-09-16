import { describe, expect, it, vi } from 'vitest';

vi.mock('./r2Assets.js', () => ({
  r2AssetUrl: vi.fn((logicalId) => logicalId === 'pawnSlug.matthias.pistolShoot'
    ? 'https://assets.test/pawn-slug/matthias/pistol-shoot.webp'
    : ''),
}));

vi.mock('three', async () => {
  const actual = await vi.importActual('three');
  return {
    ...actual,
    TextureLoader: class {
      load(_url, onLoad) {
        const texture = new actual.Texture();
        texture.repeat.set(1, 1);
        texture.offset.set(0, 0);
        onLoad(texture);
        return texture;
      }
    },
  };
});

import * as THREE from 'three';
import {
  PAWN_SLUG_MATTHIAS_AUTHORED_MOTION,
  applyPawnSlugMatthiasAuthoredMotion,
  attachPawnSlugMatthiasAuthoredMotion,
  pawnSlugMatthiasCanonicalRunFrame,
  pawnSlugMatthiasPistolShootFrame,
  pawnSlugMatthiasPistolShootWindow,
} from './pawnSlugMatthiasAuthoredMotion.js';

describe('Pawn Slug canonical Matthias authored motion', () => {
  it('slows the four real pistol run poses into a readable authored cadence', () => {
    expect(PAWN_SLUG_MATTHIAS_AUTHORED_MOTION.canonicalPistolRun.frameCount).toBe(4);
    expect(PAWN_SLUG_MATTHIAS_AUTHORED_MOTION.canonicalPistolRun.frameRate).toBe(8);
    expect(pawnSlugMatthiasCanonicalRunFrame(1, 1)).toBe(0);
    expect(pawnSlugMatthiasCanonicalRunFrame(1.13, 1)).toBe(1);
    expect(pawnSlugMatthiasCanonicalRunFrame(1.26, 1)).toBe(2);
    expect(pawnSlugMatthiasCanonicalRunFrame(1.39, 1)).toBe(3);
    expect(pawnSlugMatthiasCanonicalRunFrame(1.51, 1)).toBe(0);
  });

  it('uses an R2-backed two-frame canonical pistol shoot strip with correct facing', () => {
    expect(PAWN_SLUG_MATTHIAS_AUTHORED_MOTION.pistolShoot.logicalId).toBe('pawnSlug.matthias.pistolShoot');
    expect(PAWN_SLUG_MATTHIAS_AUTHORED_MOTION.pistolShoot.frameCount).toBe(2);
    expect(pawnSlugMatthiasPistolShootFrame(0.02)).toBe(0);
    expect(pawnSlugMatthiasPistolShootFrame(0.1)).toBe(1);

    const right = pawnSlugMatthiasPistolShootWindow(1, 1);
    expect(right.repeatX).toBeCloseTo(188 / 384, 12);
    expect(right.repeatY).toBeCloseTo(188 / 192, 12);
    expect(right.offsetX).toBeCloseTo((192 + 2) / 384, 12);
    const left = pawnSlugMatthiasPistolShootWindow(1, -1);
    expect(left.repeatX).toBeCloseTo(-188 / 384, 12);
    expect(left.offsetX).toBeCloseTo((384 - 2) / 384, 12);
  });

  it('owns the final pistol run frame and holds a real shoot pose after recoil ends', () => {
    const bodyMaterial = new THREE.SpriteMaterial();
    bodyMaterial.visible = true;
    const sprite = new THREE.Sprite(bodyMaterial);
    sprite.userData.atlas = { ready: true, weapon: 'pistol', disposed: false };
    sprite.userData.animation = {
      weapon: 'pistol',
      action: 'idle',
      frameIndex: 0,
      runStartedAt: 1,
    };
    sprite.userData.setActionFrame = vi.fn((action, frameIndex) => {
      sprite.userData.animation.action = action;
      sprite.userData.animation.frameIndex = frameIndex;
    });

    attachPawnSlugMatthiasAuthoredMotion(sprite);
    const motion = sprite.userData.pawnSlugMatthiasAuthoredMotion;
    expect(motion.shoot.ready).toBe(true);
    expect(motion.shoot.source).toBe('r2');

    const run = applyPawnSlugMatthiasAuthoredMotion(sprite, {
      time: 1.13,
      running: true,
      airborne: false,
      crouch: false,
      firing: false,
      dir: 1,
    });
    expect(run.runFrame).toBe(1);
    expect(sprite.userData.setActionFrame).toHaveBeenLastCalledWith('run', 1);

    const blast = applyPawnSlugMatthiasAuthoredMotion(sprite, {
      time: 2,
      running: false,
      crouch: false,
      firing: true,
      dir: 1,
    });
    expect(blast.shootActive).toBe(true);
    expect(blast.shootFrame).toBe(0);
    expect(motion.shoot.sprite.material.visible).toBe(true);
    expect(sprite.material.visible).toBe(false);

    const held = applyPawnSlugMatthiasAuthoredMotion(sprite, {
      time: 2.1,
      running: false,
      crouch: false,
      firing: false,
      dir: 1,
    });
    expect(held.shootActive).toBe(true);
    expect(held.shootFrame).toBe(1);
    expect(motion.shoot.sprite.material.visible).toBe(true);

    const settled = applyPawnSlugMatthiasAuthoredMotion(sprite, {
      time: 2.2,
      running: false,
      crouch: false,
      firing: false,
      dir: 1,
    });
    expect(settled.shootActive).toBe(false);
    expect(motion.shoot.sprite.material.visible).toBe(false);
    expect(sprite.material.visible).toBe(true);
  });
});
