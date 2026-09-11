import { describe, expect, it } from 'vitest';
import { PAWN_SLUG_SPAWNS } from './pawnSlug.js';
import {
  PAWN_SLUG_MICRO_AMBUSHES,
  PAWN_SLUG_MICRO_AMBUSH_META,
  pawnSlugMicroAmbushPositionForSpawn,
  pawnSlugMicroAmbushSpawns,
  pawnSlugSpawnBelongsToMicroAmbush,
} from './pawnSlugMicroAmbushes.js';

describe('Pawn Slug micro ambushes', () => {
  it('reuses a small bounded subset of the existing mission population', () => {
    expect(PAWN_SLUG_MICRO_AMBUSHES).toHaveLength(3);
    for (const ambush of PAWN_SLUG_MICRO_AMBUSHES) {
      expect(ambush.members.length).toBeGreaterThanOrEqual(2);
      expect(ambush.members.length).toBeLessThanOrEqual(PAWN_SLUG_MICRO_AMBUSH_META.maxMembers);
      expect(ambush.members.every((member) => ['pawn', 'knight', 'rook'].includes(member.type))).toBe(true);
      expect(Math.min(...ambush.members.map((member) => member.offset))).toBeGreaterThanOrEqual(PAWN_SLUG_MICRO_AMBUSH_META.minLeadDistance);
    }
    expect(PAWN_SLUG_MICRO_AMBUSH_META.reusesMissionPopulation).toBe(true);
    expect(PAWN_SLUG_MICRO_AMBUSH_META.activation).toBe('existing-camera-spawn-window');
  });

  it('keeps source identities while repositioning each group safely ahead', () => {
    for (const ambush of PAWN_SLUG_MICRO_AMBUSHES) {
      const spawns = pawnSlugMicroAmbushSpawns(ambush);
      expect(spawns.map((spawn) => spawn.id)).toEqual(ambush.members.map((member) => member.sourceId));
      expect(spawns.every((spawn) => spawn.x - ambush.triggerX >= PAWN_SLUG_MICRO_AMBUSH_META.minLeadDistance)).toBe(true);
      expect(spawns.every((spawn) => pawnSlugSpawnBelongsToMicroAmbush(spawn.id))).toBe(true);
    }
    expect(pawnSlugSpawnBelongsToMicroAmbush('bishop-10')).toBe(false);
    expect(pawnSlugSpawnBelongsToMicroAmbush('boss-panzer-rook')).toBe(false);
  });

  it('feeds the relocated encounters into the canonical spawn catalog without adding enemies', () => {
    expect(PAWN_SLUG_SPAWNS).toHaveLength(23);
    expect(new Set(PAWN_SLUG_SPAWNS.map((spawn) => spawn.id)).size).toBe(PAWN_SLUG_SPAWNS.length);

    const liveAmbushSpawns = PAWN_SLUG_SPAWNS.filter((spawn) => spawn.ambushId);
    expect(liveAmbushSpawns).toHaveLength(9);
    for (const spawn of liveAmbushSpawns) {
      const relocated = pawnSlugMicroAmbushPositionForSpawn({ id: spawn.id, x: -1, type: spawn.type });
      expect(relocated.x).toBe(spawn.x);
      expect(relocated.ambushId).toBe(spawn.ambushId);
    }

    const bishops = PAWN_SLUG_SPAWNS.filter((spawn) => spawn.type === 'bishop');
    expect(bishops).toHaveLength(2);
    expect(bishops.every((spawn) => !spawn.ambushId)).toBe(true);
  });
});
