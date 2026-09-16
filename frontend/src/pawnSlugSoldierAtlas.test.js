import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_SOLDIER_ATLAS_LOGICAL_ID,
  PAWN_SLUG_SOLDIER_ATLAS_META,
  PAWN_SLUG_SOLDIER_ATLAS_URL,
  pawnSlugSoldierAtlasWindow,
} from './pawnSlugSoldierAtlas.js';

describe('Pawn Slug Blender soldier atlas', () => {
  it('uses the reviewed Blender bake from R2 while preserving a local migration fallback', () => {
    expect(PAWN_SLUG_SOLDIER_ATLAS_LOGICAL_ID).toBe('pawnSlug.enemy.actionAtlas');
    expect(PAWN_SLUG_SOLDIER_ATLAS_URL).toBe('https://assets.chess-studio.shadowops.dpdns.org/pawn-slug/enemies/action-atlas/enemy_cast_blender_v1_runtime-cf57e6e6be5a5d4a.webp');
    expect(PAWN_SLUG_SOLDIER_ATLAS_META).toMatchObject({
      frameWidth: 96,
      frameHeight: 96,
      columns: 16,
      rows: 21,
      theme: 'military-chess-soldiers-blender',
      sourceVersion: 'blender-enemy-v1',
      authoredBy: 'Blender',
      sourceFacing: 'left',
      runtimeComposite: true,
      generatedOnce: false,
      lazyFrameDrawing: false,
      prewarmedBeforeUpload: true,
      sharedTextureSource: true,
      mipmaps: false,
      logicalId: 'pawnSlug.enemy.actionAtlas',
      transport: 'r2-cdn-with-local-webp-fallback',
      localFallbackAsset: 'enemy_cast_blender_v1_runtime.webp',
    });
    expect(PAWN_SLUG_SOLDIER_ATLAS_META.types).toEqual(['pawn', 'knight', 'rook']);
    expect(PAWN_SLUG_SOLDIER_ATLAS_META.actions).toEqual(['idle', 'run', 'jump', 'crouch', 'hurt', 'climb', 'death']);
  });

  it('keeps each class and action in the established rows including terminal death', () => {
    expect(pawnSlugSoldierAtlasWindow('pawn', 'idle', 0, -1).row).toBe(0);
    expect(pawnSlugSoldierAtlasWindow('pawn', 'death', 0, -1).row).toBe(6);
    expect(pawnSlugSoldierAtlasWindow('knight', 'idle', 0, -1).row).toBe(7);
    expect(pawnSlugSoldierAtlasWindow('knight', 'death', 0, -1).row).toBe(13);
    expect(pawnSlugSoldierAtlasWindow('rook', 'climb', 0, -1).row).toBe(19);
    expect(pawnSlugSoldierAtlasWindow('rook', 'death', 13, -1).row).toBe(20);
  });

  it('wraps long action tracks and mirrors only the horizontal UV axis', () => {
    const left = pawnSlugSoldierAtlasWindow('knight', 'run', 15, -1);
    const right = pawnSlugSoldierAtlasWindow('knight', 'run', 15, 1);
    expect(left.frame).toBe(15);
    expect(right.frame).toBe(15);
    expect(left.repeatX).toBeCloseTo(1 / 16, 12);
    expect(right.repeatX).toBeCloseTo(-1 / 16, 12);
    expect(left.repeatY).toBeCloseTo(1 / 21, 12);
    expect(left.offsetY).toBe(right.offsetY);
    expect(pawnSlugSoldierAtlasWindow('pawn', 'jump', 10, -1).frame).toBe(0);
  });
});
