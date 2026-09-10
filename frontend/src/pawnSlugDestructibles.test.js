import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_DESTRUCTIBLE_META,
  PAWN_SLUG_DESTRUCTIBLES,
  pawnSlugDamageDestructible,
  pawnSlugDestructiblesForScenario,
} from './pawnSlugDestructibles.js';

describe('Pawn Slug diegetic destructibles', () => {
  it('uses deterministic scenario caches instead of random loot boxes', () => {
    expect(PAWN_SLUG_DESTRUCTIBLE_META.deterministic).toBe(true);
    expect(PAWN_SLUG_DESTRUCTIBLE_META.philosophy).toContain('diegetic');
    expect(PAWN_SLUG_DESTRUCTIBLES.length).toBeGreaterThanOrEqual(5);
    expect(pawnSlugDestructiblesForScenario('gambit-ruins')).toHaveLength(2);
  });

  it('reveals a reward only when the prop is destroyed', () => {
    const crate = PAWN_SLUG_DESTRUCTIBLES[0];
    expect(pawnSlugDamageDestructible(crate, crate.hp - 1)).toMatchObject({ destroyed: false, hp: 1, reward: null });
    const destroyed = pawnSlugDamageDestructible(crate, crate.hp);
    expect(destroyed.destroyed).toBe(true);
    expect(destroyed.reward).toEqual(crate.reward);
  });

  it('keeps rewards inside the existing economy vocabulary', () => {
    for (const entry of PAWN_SLUG_DESTRUCTIBLES) {
      expect(Object.keys(entry.reward).every((key) => ['credits', 'ammo', 'grenades'].includes(key))).toBe(true);
    }
  });
});
