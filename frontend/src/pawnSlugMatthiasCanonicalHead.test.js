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
  pawnSlugCanonicalHeadAtlasWindow,
  pawnSlugCanonicalHeadPose,
  pawnSlugPremiumMatthiasAtlasWindow,
} from './pawnSlugMatthiasIntegratedSprites.js';

describe('Pawn Slug canonical Matthias head art', () => {
  it('reuses the approved motion sheet and selects the real head for every pose', () => {
    expect(PAWN_SLUG_MATTHIAS_CANONICAL_HEAD_ART).toMatchObject({
      version: 'canonical-head-motion-v2',
      source: 'existing-matthias-motion-atlas-v5',
      purpose: 'frame-specific-face-cap-neck-authority',
      sourceFacing: 'right',
      weaponIndependent: true,
      frameSpecific: true,
      reusesExistingAtlas: true,
      textureWidth: 1536,
      textureHeight: 480,
      frameWidth: 96,
      frameHeight: 96,
    });
    expect(PAWN_SLUG_MATTHIAS_INTEGRATED_ART.canonicalHeadArt).toBe(PAWN_SLUG_MATTHIAS_CANONICAL_HEAD_ART);
    expect(PAWN_SLUG_MATTHIAS_INTEGRATED_ART.separateWeaponOverlay).toBe(false);
    expect(pawnSlugCanonicalHeadAtlasUrl()).toMatch(
      /^https:\/\/assets\.chess-studio\.shadowops\.dpdns\.org\/pawn-slug\/matthias\/motion\//,
    );

    const sprite = createIntegratedMatthiasSlugSprite();
    sprite.userData.setWeapon('machinegun');
    const head = sprite.getObjectByName('pawn-slug-matthias-canonical-head');
    expect(head).toBeTruthy();
    expect(head.userData.pawnSlugCanonicalHeadOverlay).toBe(true);
    expect(head.userData.pawnSlugFrameSpecificHeadCrop).toBe(true);
    expect(sprite.userData.canonicalHead.ready).toBe(true);
    expect(sprite.userData.canonicalHead.source).toBe('canonical');
    expect(sprite.userData.atlas.weapon).toBe('machinegun');
  });

  it('crops and mirrors the canonical frame independently from the screen-left premium body bank', () => {
    const headRight = pawnSlugCanonicalHeadAtlasWindow('run', 3, 1);
    const headLeft = pawnSlugCanonicalHeadAtlasWindow('run', 3, -1);
    const bodyRight = pawnSlugPremiumMatthiasAtlasWindow('run', 3, 1);
    const bodyLeft = pawnSlugPremiumMatthiasAtlasWindow('run', 3, -1);

    expect(headRight.rect).toEqual([29, 4, 45, 45]);
    expect(headRight.mirrored).toBe(false);
    expect(headLeft.mirrored).toBe(true);
    expect(headRight.repeatX).toBeGreaterThan(0);
    expect(headLeft.repeatX).toBeLessThan(0);
    expect(Math.abs(headRight.repeatX)).toBeCloseTo(Math.abs(headLeft.repeatX));
    expect(bodyRight.mirrored).toBe(true);
    expect(bodyLeft.mirrored).toBe(false);

    const poseRight = pawnSlugCanonicalHeadPose('run', 3, 1);
    const poseLeft = pawnSlugCanonicalHeadPose('run', 3, -1);
    expect(poseRight.x).toBeCloseTo(-poseLeft.x);
    expect(poseRight.y).toBeCloseTo(poseLeft.y);
    expect(poseRight.scaleX).toBeCloseTo(45 / 96);
    expect(poseRight.scaleY).toBeCloseTo(45 / 96);
  });

  it('updates real head UVs and geometry with run, crouch and direction changes', () => {
    const sprite = createIntegratedMatthiasSlugSprite();
    sprite.userData.setWeapon('machinegun');
    const head = sprite.userData.canonicalHead.sprite;
    const headTexture = sprite.userData.canonicalHead.texture;

    sprite.userData.setActionFrame('run', 3);
    let expectedWindow = pawnSlugCanonicalHeadAtlasWindow('run', 3, 1);
    let expectedPose = pawnSlugCanonicalHeadPose('run', 3, 1);
    expect(headTexture.repeat.set).toHaveBeenLastCalledWith(expectedWindow.repeatX, expectedWindow.repeatY);
    expect(headTexture.offset.set).toHaveBeenLastCalledWith(expectedWindow.offsetX, expectedWindow.offsetY);
    expect(head.position.x).toBeCloseTo(expectedPose.x);
    expect(head.position.y).toBeCloseTo(expectedPose.y);
    expect(head.scale.x).toBeCloseTo(expectedPose.scaleX);
    expect(head.scale.y).toBeCloseTo(expectedPose.scaleY);

    sprite.userData.setDirection(-1);
    expectedWindow = pawnSlugCanonicalHeadAtlasWindow('run', 3, -1);
    expectedPose = pawnSlugCanonicalHeadPose('run', 3, -1);
    expect(headTexture.repeat.set).toHaveBeenLastCalledWith(expectedWindow.repeatX, expectedWindow.repeatY);
    expect(head.position.x).toBeCloseTo(expectedPose.x);

    sprite.userData.setActionFrame('crouch', 0);
    expectedWindow = pawnSlugCanonicalHeadAtlasWindow('crouch', 0, -1);
    expectedPose = pawnSlugCanonicalHeadPose('crouch', 0, -1);
    expect(expectedWindow.rect).toEqual([28, 23, 40, 45]);
    expect(headTexture.offset.set).toHaveBeenLastCalledWith(expectedWindow.offsetX, expectedWindow.offsetY);
    expect(head.position.y).toBeCloseTo(expectedPose.y);
  });

  it('keeps the canonical face/cap attached and frame-correct through every premium weapon bank', () => {
    const sprite = createIntegratedMatthiasSlugSprite();
    sprite.userData.setWeapon('machinegun');
    const head = sprite.userData.canonicalHead.sprite;
    const canonicalTexture = sprite.userData.canonicalHead.texture;

    sprite.userData.setActionFrame('run', 3);
    sprite.userData.setDirection(-1);
    const expectedWindow = pawnSlugCanonicalHeadAtlasWindow('run', 3, -1);
    const expectedPose = pawnSlugCanonicalHeadPose('run', 3, -1);

    for (const weapon of ['machinegun', 'shotgun', 'panzerfaust']) {
      sprite.userData.setWeapon(weapon);

      expect(sprite.userData.atlas.weapon).toBe(weapon);
      expect(sprite.userData.atlas.ready).toBe(true);
      expect(sprite.userData.atlas.source).toBe('primary');
      expect(sprite.userData.canonicalHead.texture).toBe(canonicalTexture);
      expect(sprite.userData.canonicalHead.ready).toBe(true);
      expect(sprite.userData.canonicalHead.source).toBe('canonical');
      expect(head.parent).toBe(sprite);
      expect(head.material.map).toBe(canonicalTexture);
      expect(head.material.visible).toBe(true);
      expect(canonicalTexture.repeat.set).toHaveBeenLastCalledWith(expectedWindow.repeatX, expectedWindow.repeatY);
      expect(canonicalTexture.offset.set).toHaveBeenLastCalledWith(expectedWindow.offsetX, expectedWindow.offsetY);
      expect(head.position.x).toBeCloseTo(expectedPose.x);
      expect(head.position.y).toBeCloseTo(expectedPose.y);
      expect(head.scale.x).toBeCloseTo(expectedPose.scaleX);
      expect(head.scale.y).toBeCloseTo(expectedPose.scaleY);
    }
  });
});
