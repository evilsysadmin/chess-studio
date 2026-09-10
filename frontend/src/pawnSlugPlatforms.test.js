import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_PLATFORM_LAYOUT,
  PAWN_SLUG_PLATFORM_META,
  pawnSlugPlatformAtX,
  pawnSlugPlatformBounds,
  pawnSlugPlatformCameraY,
  pawnSlugPlatformLookAtY,
  pawnSlugPlatformSupportY,
  pawnSlugResolvePlatformLanding,
} from './pawnSlugPlatforms.js';
import {
  PAWN_SLUG_SCENARIO_TILEMAPS,
  pawnSlugScenarioPlatforms,
} from './pawnSlugTileMaps.js';

describe('Pawn Slug platforming', () => {
  it('adds real vertical routes across the mission from tile-map-owned data', () => {
    expect(PAWN_SLUG_PLATFORM_META.platformCount).toBeGreaterThanOrEqual(12);
    expect(PAWN_SLUG_PLATFORM_META.maxHeight).toBeGreaterThanOrEqual(4);
    expect(PAWN_SLUG_PLATFORM_META.oneWay).toBe(true);
    expect(PAWN_SLUG_PLATFORM_META.jumpThroughFromBelow).toBe(true);
    expect(PAWN_SLUG_PLATFORM_META.source).toBe('tile-map');

    const heights = new Set(PAWN_SLUG_PLATFORM_LAYOUT.map((platform) => platform.y));
    expect(heights.size).toBeGreaterThanOrEqual(6);
    expect(PAWN_SLUG_PLATFORM_LAYOUT[0].x).toBeLessThan(20);
    expect(PAWN_SLUG_PLATFORM_LAYOUT.at(-1).x).toBeGreaterThan(105);
  });

  it('uses the dungeon scenario platform directly in the runtime physics layout', () => {
    const [dungeonPlatform] = pawnSlugScenarioPlatforms(PAWN_SLUG_SCENARIO_TILEMAPS.castleDungeon);
    expect(dungeonPlatform.id).toBe('dungeon-catwalk');
    expect(dungeonPlatform.oneWay).toBe(true);
    expect(PAWN_SLUG_PLATFORM_LAYOUT).toContain(dungeonPlatform);
  });

  it('derives stable platform bounds', () => {
    const platform = { x: 10, y: 3, width: 4 };
    expect(pawnSlugPlatformBounds(platform)).toEqual({ left: 8, right: 12, top: 3 });
  });

  it('lands only while falling through a platform top', () => {
    const platform = { id: 'test', x: 10, y: 3, width: 4 };
    const landing = pawnSlugResolvePlatformLanding({
      previousY: 3.25,
      nextY: 2.8,
      vy: -4,
      left: 9.6,
      right: 10.4,
    }, [platform]);
    expect(landing).toBe(platform);

    expect(pawnSlugResolvePlatformLanding({
      previousY: 2.4,
      nextY: 2.8,
      vy: 4,
      left: 9.6,
      right: 10.4,
    }, [platform])).toBeNull();
  });

  it('does not catch Matthias outside the platform or while dropping through', () => {
    const platform = { id: 'test', x: 10, y: 3, width: 4 };
    expect(pawnSlugResolvePlatformLanding({
      previousY: 3.2,
      nextY: 2.8,
      vy: -3,
      left: 12.1,
      right: 12.8,
    }, [platform])).toBeNull();

    expect(pawnSlugResolvePlatformLanding({
      previousY: 3.2,
      nextY: 2.8,
      vy: -3,
      left: 9.5,
      right: 10.5,
      dropThrough: true,
    }, [platform])).toBeNull();
  });

  it('finds the highest traversable platform under a coordinate', () => {
    const lower = { id: 'lower', x: 10, y: 1.5, width: 5 };
    const upper = { id: 'upper', x: 10, y: 3.5, width: 3 };
    expect(pawnSlugPlatformAtX(10, [lower, upper])).toBe(upper);
    expect(pawnSlugPlatformAtX(13, [lower, upper])).toBeNull();
  });

  it('recognizes support at platform height without inventing support in mid-air', () => {
    const platform = { id: 'test', x: 10, y: 3, width: 4 };
    expect(pawnSlugPlatformSupportY({ x: 10, feetY: 3.03 }, [platform])).toBe(3);
    expect(pawnSlugPlatformSupportY({ x: 10, feetY: 4 }, [platform])).toBe(0);
  });

  it('lifts the camera smoothly for vertical play while keeping ground framing', () => {
    expect(pawnSlugPlatformCameraY(0)).toBe(5.1);
    expect(pawnSlugPlatformLookAtY(0)).toBe(4.25);
    expect(pawnSlugPlatformCameraY(4)).toBeGreaterThan(5.1);
    expect(pawnSlugPlatformLookAtY(4)).toBeGreaterThan(4.25);
    expect(pawnSlugPlatformCameraY(100)).toBeLessThanOrEqual(7.8);
    expect(pawnSlugPlatformLookAtY(100)).toBeLessThanOrEqual(6.35);
  });
});
