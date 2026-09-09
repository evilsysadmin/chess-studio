import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_SPRITE_META,
  pawnSlugEnemyRunAtlasWindow,
} from './pawnSlugSprites.js';

describe('Pawn Slug premium enemy run atlas', () => {
  it('gives pawn, knight and rook eight real run frames each', () => {
    const meta = PAWN_SLUG_SPRITE_META.enemies.runAtlas;
    expect(meta.frames).toBe(24);
    expect(meta.framesPerType).toBe(8);
    expect(meta.frameWidth).toBe(64);
    expect(meta.frameHeight).toBe(64);
    expect(meta.sourceFacing).toBe('left');
    expect(meta.runtimeFacings).toEqual(['right', 'left']);
    expect(meta.directionMode).toBe('atlas-uv-mirror');
    expect(meta.frameBaseByType).toEqual({ pawn: 0, knight: 8, rook: 16 });
    expect(String(meta.fallbackUrl)).toMatch(/enemy_atlas_v2\.webp(?:\?|$)/);
    expect(String(meta.fallbackUrl)).not.toMatch(/\.svg(?:\?|$)/);
  });

  it('selects the correct eight-frame bank for each enemy class', () => {
    expect(pawnSlugEnemyRunAtlasWindow('pawn', 0, -1)).toMatchObject({ frame: 0, frameInType: 0 });
    expect(pawnSlugEnemyRunAtlasWindow('pawn', 7, -1)).toMatchObject({ frame: 7, frameInType: 7 });
    expect(pawnSlugEnemyRunAtlasWindow('knight', 0, -1)).toMatchObject({ frame: 8, frameInType: 0 });
    expect(pawnSlugEnemyRunAtlasWindow('knight', 7, -1)).toMatchObject({ frame: 15, frameInType: 7 });
    expect(pawnSlugEnemyRunAtlasWindow('rook', 0, -1)).toMatchObject({ frame: 16, frameInType: 0 });
    expect(pawnSlugEnemyRunAtlasWindow('rook', 7, -1)).toMatchObject({ frame: 23, frameInType: 7 });
    expect(pawnSlugEnemyRunAtlasWindow('rook', 8, -1)).toMatchObject({ frame: 16, frameInType: 0 });
  });

  it('uses the authored left-facing frame directly and mirrors UVs for right-facing motion', () => {
    const left = pawnSlugEnemyRunAtlasWindow('knight', 3, -1);
    const right = pawnSlugEnemyRunAtlasWindow('knight', 3, 1);
    expect(left).toMatchObject({ frame: 11, direction: -1, mirrored: false });
    expect(right).toMatchObject({ frame: 11, direction: 1, mirrored: true });
    expect(left.repeatX).toBeCloseTo(1 / 24, 12);
    expect(right.repeatX).toBeCloseTo(-1 / 24, 12);
    expect(left.offsetX).toBeCloseTo(11 / 24, 12);
    expect(right.offsetX).toBeCloseTo(12 / 24, 12);
  });
});
