import { describe, expect, it } from 'vitest';
import { homeCastleMemory } from './homeCastleLife.js';

describe('home castle milestone contract', () => {
  it('never promotes mere play count into a performance trophy', () => {
    expect(homeCastleMemory({ record: { games: 500, wins: 0, bestHumanStreak: 0 } })).toBeNull();
  });

  it('keeps malformed persisted counters from creating fake milestones', () => {
    expect(homeCastleMemory({ record: { wins: 'banana', bestHumanStreak: -4 } })).toBeNull();
  });
});
