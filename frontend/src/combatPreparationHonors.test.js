import { describe, expect, it } from 'vitest';
import { combatPreparationHonors } from './combatPreparationHonors.js';
import { deploymentSquareForSlot } from './combatDeployment.js';

describe('Combat Operations · earned honours on deployed identities', () => {
  it('shows proven medals only, independently of rank and never from mere experience', () => {
    const roster = {
      deployment: { 'p-a': 'p-a', 'p-b': 'p-b', 'p-c': 'p-c' },
      pieces: {
        'p-a': { strengthPoints: 3, speedPoints: 1 },
        'p-b': { strengthPoints: 0, speedPoints: 0 },
        'p-c': { strengthPoints: 6, speedPoints: 0 },
      },
      identities: {
        'p-a': { identityId: 'veteran-001' },
        'p-b': { identityId: 'veteran-002' },
        'p-c': { identityId: 'veteran-003' },
      },
      unitRecords: {
        'veteran-001': { decorations: [{ id: 'baptism', earnedAt: '2026-10-21' }, { id: 'five_kills', earnedAt: '2026-10-22' }] },
        'veteran-002': { decorations: [{ id: 'boss_survivor', earnedAt: '2026-10-22' }] },
        'veteran-003': { decorations: [] },
      },
    };
    const result = combatPreparationHonors(roster);
    const a = deploymentSquareForSlot('p-a', 'w');
    const b = deploymentSquareForSlot('p-b', 'w');
    const c = deploymentSquareForSlot('p-c', 'w');
    expect(result.rankLevels[a]).toBe(5);
    expect(result.rankLevels[c]).toBe(7);
    expect(result.rankLevels[b]).toBeUndefined();
    expect(result.medalCounts).toEqual({ [a]: 2, [b]: 1 });
  });

  it('does not inherit medals from another identity or award unrecorded decorations', () => {
    const roster = {
      deployment: { 'p-a': 'p-a' },
      pieces: { 'p-a': { strengthPoints: 8 } },
      identities: { 'p-a': { identityId: 'recruit-now' } },
      unitRecords: {
        'retired-veteran': { decorations: [{ id: 'ace' }] },
        'recruit-now': { decorations: [{ id: 'unrecognized-medal' }] },
      },
    };
    expect(combatPreparationHonors(roster).medalCounts).toEqual({});
    expect(combatPreparationHonors({})).toEqual({ rankLevels: {}, medalCounts: {} });
  });
});
