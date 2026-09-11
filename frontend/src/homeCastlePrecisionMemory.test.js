import { describe, expect, it } from 'vitest';
import { homeCastleMemories, homeCastlePrecisionMemory } from './homeCastleLife.js';

describe('Home castle precision relic', () => {
  it('does not unlock from ordinary participation or fewer than three clean full days', () => {
    expect(homeCastlePrecisionMemory({ cleanFullDays: 0 })).toBeNull();
    expect(homeCastlePrecisionMemory({ cleanFullDays: 2, activeDays: 80, completedChallenges: 200 })).toBeNull();
  });

  it('unlocks from three factual 3/3 clean Daily results', () => {
    expect(homeCastlePrecisionMemory({ cleanFullDays: 3 })).toEqual({
      id: 'daily-clean-full',
      kind: 'precision-relic',
      destination: 'daily',
      title: 'Medallón de precisión',
      detail: '3 plenos diarios 3/3 resueltos sin una sola mancha.',
    });
  });

  it('can fill the third diegetic memory slot beside real rivalry and streak honours', () => {
    const memories = homeCastleMemories({
      rivalry: { record: { bestHumanStreak: 6, wins: 12 } },
      dailyStats: { bestStreak: 9, cleanFullDays: 4 },
    });
    expect(memories).toHaveLength(3);
    expect(memories.map((memory) => memory.id)).toEqual([
      'rivalry-streak',
      'daily-streak',
      'daily-clean-full',
    ]);
    expect(memories.every((memory) => ['daily', 'history'].includes(memory.destination))).toBe(true);
  });
});
