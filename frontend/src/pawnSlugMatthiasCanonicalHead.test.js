import { describe, expect, it, vi } from 'vitest';

vi.mock('three', async () => {
  const actual = await vi.importActual('three');
  return {
    ...actual,
    TextureLoader: class {
      load(_url, onLoad) {
        const texture = {
          repeat: { set: vi.fn() },
          offset: { set: vi.fn() },
          dispose: vi.fn(),
          needsUpdate: false,
        };
        onLoad(texture);
        return texture;
      }
    },
  };
});

import {
  PAWN_SLUG_MATTHIAS_CANONICAL_HEAD_ART,
  PAWN_SLUG_MATTHIAS_INTEGRATED_ART,
  createIntegratedMatthiasSlugSprite,
  pawnSlugCanonicalHeadAtlasUrl,
  pawnSlugCanonicalHeadPose,
} from './pawnSlugMatthiasIntegratedSprites.js';

describe('Pawn Slug canonical Matthias head art', () => {
  it('uses the approved face and officer cap without replacing baked weapon art', () => {
    expect(PAWN_SLUG_MATTHIAS_CANONICAL_HEAD_ART.version).toBe('canonical-head-v1');
    expect(PAWN_SLUG_MATTHIAS_CANONICAL_HEAD_ART.purpose).toBe('face-and-officer-cap-authority');
    expect(PAWN_SLUG_MATTHIAS_CANONICAL_HEAD_ART.weaponIndependent).toBe(true);
    expect(PAWN_SLUG_MATTHIAS_INTEGRATED_ART.canonicalHeadArt).toBe(PAWN_SLUG_MATTHIAS_CANONICAL_HEAD_ART);
    expect(PAWN_SLUG_MATTHIAS_INTEGRATED_ART.separateWeaponOverlay).toBe(false);
    expect(pawnSlugCanonicalHeadAtlasUrl()).toMatch(/^data:image\/webp;base64,/);

    const sprite = createIntegratedMatthiasSlugSprite();
    const head = sprite.getObjectByName('pawn-slug-matthias-canonical-head');
    expect(head).toBeTruthy();
    expect(head.userData.pawnSlugCanonicalHeadOverlay).toBe(true);
    expect(sprite.userData.canonicalHead.ready).toBe(true);
    expect(sprite.userData.canonicalHead.source).toBe('canonical');
    expect(sprite.userData.atlas.weapon).toBe('pistol');
  });

  it('tracks run/crouch/jump head bob and mirrors its anchor with world direction', () => {
    const runLeft = pawnSlugCanonicalHeadPose('run', 3, -1);
    const runRight = pawnSlugCanonicalHeadPose('run', 3, 1);
    const crouch = pawnSlugCanonicalHeadPose('crouch', 0, -1);
    const jump = pawnSlugCanonicalHeadPose('jump', 2, -1);

    expect(runRight.x).toBeCloseTo(-runLeft.x);
    expect(runRight.y).toBeCloseTo(runLeft.y);
    expect(crouch.y).toBeLessThan(runLeft.y);
    expect(jump.y).toBeLessThan(runLeft.y);

    const sprite = createIntegratedMatthiasSlugSprite();
    const head = sprite.userData.canonicalHead.sprite;
    sprite.userData.setActionFrame('crouch', 0);
    const crouchY = head.position.y;
    sprite.userData.setActionFrame('run', 3);
    expect(head.position.y).toBeGreaterThan(crouchY);
    sprite.userData.setDirection(-1);
    const leftX = head.position.x;
    sprite.userData.setDirection(1);
    expect(head.position.x).toBeCloseTo(-leftX);
  });
});
