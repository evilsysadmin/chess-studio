import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_MICRO_AMBUSHES,
  PAWN_SLUG_MICRO_AMBUSH_META,
  pawnSlugMicroAmbushSpawns,
  pawnSlugPendingMicroAmbushes,
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
  });

  it('fires each encounter once when Matthias crosses its trigger', () => {
    const triggered = new Set();
    expect(pawnSlugPendingMicroAmbushes({ playerX: 899, triggeredIds: triggered })).toHaveLength(0);
    const first = pawnSlugPendingMicroAmbushes({ playerX: 900, triggeredIds: triggered });
    expect(first.map((ambush) => ambush.id)).toEqual(['forest-contact']);
    triggered.add('forest-contact');
    expect(pawnSlugPendingMicroAmbushes({ playerX: 1659, triggeredIds: triggered })).toHaveLength(0);
    expect(pawnSlugPendingMicroAmbushes({ playerX: 1660, triggeredIds: triggered }).map((ambush) => ambush.id)).toEqual(['ruins-crossfire']);
  });

  it('keeps source identities while repositioning the group safely ahead', () => {
    const ambush = PAWN_SLUG_MICRO_AMBUSHES[0];
    const spawns = pawnSlugMicroAmbushSpawns(ambush);
    expect(spawns.map((spawn) => spawn.id)).toEqual(ambush.members.map((member) => member.sourceId));
    expect(spawns.every((spawn) => spawn.x - ambush.triggerX >= PAWN_SLUG_MICRO_AMBUSH_META.minLeadDistance)).toBe(true);
    expect(spawns.every((spawn) => pawnSlugSpawnBelongsToMicroAmbush(spawn.id))).toBe(true);
    expect(pawnSlugSpawnBelongsToMicroAmbush('bishop-10')).toBe(false);
    expect(pawnSlugSpawnBelongsToMicroAmbush('boss-panzer-rook')).toBe(false);
  });
});
