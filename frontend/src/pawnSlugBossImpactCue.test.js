import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./pawnSlugSpriteCore.js', () => ({
  PAWN_SLUG_SPRITE_META: { matthias: {}, enemies: {} },
  animateMatthiasSlugSprite: vi.fn(),
  animatePanzerRookSprite: vi.fn(),
  createWeaponSprite: vi.fn(),
}));
vi.mock('./pawnSlugEnemyRunSprites.js', () => ({
  PAWN_SLUG_ENEMY_RUN_META: {},
  animateSlugEnemySprite: vi.fn(),
  createSlugEnemySprite: vi.fn(),
  pawnSlugEnemyRunAtlasWindow: vi.fn(),
}));
vi.mock('./pawnSlugBossEntryMotion.js', () => ({
  pawnSlugPanzerRookEntryPose: vi.fn(() => ({
    active: false,
    x: 0,
    y: 0,
    sx: 1,
    sy: 1,
    rz: 0,
  })),
}));
vi.mock('./pawnSlugMatthiasPremiumMotion.js', () => ({
  applyPawnSlugMatthiasPremiumMotion: vi.fn(),
}));
vi.mock('./pawnSlugSfx.js', () => ({
  playPawnSlugEnemyImpactSfx: vi.fn(),
  playPawnSlugPlayerHitSfx: vi.fn(),
}));

import { animatePanzerRookSprite, PAWN_SLUG_SPRITE_META } from './pawnSlugSprites.js';
import { playPawnSlugEnemyImpactSfx } from './pawnSlugSfx.js';

function bossSprite() {
  return {
    userData: {},
    position: { x: 0, y: 0 },
    scale: { x: 1, y: 1 },
    material: { rotation: 0 },
  };
}

describe('Pawn Slug Panzer-Rook impact feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('plays one heavy premium cue on each fresh hurt edge', () => {
    const sprite = bossSprite();

    animatePanzerRookSprite(sprite, 1, { hurt: false });
    animatePanzerRookSprite(sprite, 1.01, { hurt: true });
    animatePanzerRookSprite(sprite, 1.02, { hurt: true });
    animatePanzerRookSprite(sprite, 1.2, { hurt: false });
    animatePanzerRookSprite(sprite, 1.21, { hurt: true });

    expect(playPawnSlugEnemyImpactSfx).toHaveBeenCalledTimes(2);
    expect(playPawnSlugEnemyImpactSfx).toHaveBeenNthCalledWith(1, 'boss');
    expect(playPawnSlugEnemyImpactSfx).toHaveBeenNthCalledWith(2, 'boss');
    expect(PAWN_SLUG_SPRITE_META.enemies.panzerRookImpactCue).toBe('premium-boss-edge-trigger');
  });
});
