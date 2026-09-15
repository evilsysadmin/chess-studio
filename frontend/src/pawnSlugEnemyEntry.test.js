import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_ENEMY_ENTRY_META,
  pawnSlugEnemyEntryCombatReady,
  pawnSlugEnemyEntrySpawnX,
  pawnSlugEnemyEntrySprintSpeed,
  pawnSlugRegularEnemyType,
} from './pawnSlugEnemyEntry.js';

describe('Pawn Slug enemy entry etiquette', () => {
  it('pushes delayed spawns beyond the visible right edge instead of materializing on screen', () => {
    const cameraX = 40;
    const viewWidth = 30;
    const visibleRight = cameraX + viewWidth * 0.5;
    const entryX = pawnSlugEnemyEntrySpawnX(48, cameraX, viewWidth);
    expect(entryX).toBeGreaterThan(visibleRight);
    expect(entryX - visibleRight).toBeCloseTo(PAWN_SLUG_ENEMY_ENTRY_META.spawnMargin, 6);
  });

  it('preserves authored spawns that are already farther off screen', () => {
    expect(pawnSlugEnemyEntrySpawnX(90, 40, 30)).toBe(90);
  });

  it('keeps every regular soldier sprinting and unready until it has crossed into the playfield', () => {
    for (const type of ['pawn', 'knight', 'rook']) {
      expect(pawnSlugRegularEnemyType(type)).toBe(true);
      expect(pawnSlugEnemyEntrySprintSpeed(type, 4)).toBeGreaterThan(4);
    }
    expect(pawnSlugRegularEnemyType('bishop')).toBe(false);
    expect(pawnSlugEnemyEntryCombatReady(54, 40, 30)).toBe(false);
    expect(pawnSlugEnemyEntryCombatReady(52, 40, 30)).toBe(true);
  });
});
