import { describe, expect, it } from 'vitest';
import { createChroniclesState } from '../chroniclesOfMatthias.js';
import { chroniclesTacticsCheckpointFingerprint } from './chroniclesTacticsCheckpointPolicy.js';

describe('Chronicles Tactics checkpoint policy', () => {
  it('ignores pure exploration locomotion but persists semantic exploration changes', () => {
    const base = createChroniclesState('gallery-of-forks');
    const original = chroniclesTacticsCheckpointFingerprint(base);

    expect(chroniclesTacticsCheckpointFingerprint({
      ...base,
      x: base.x + 2,
      y: base.y - 1,
      direction: 3,
      explorationEnemySteps: 2,
    })).toBe(original);

    expect(chroniclesTacticsCheckpointFingerprint({
      ...base,
      galleryLeverPulled: true,
    })).not.toBe(original);

    const enemyId = 'fork-stalker';
    expect(chroniclesTacticsCheckpointFingerprint({
      ...base,
      explorationEnemySteps: 3,
      enemyPositions: { [enemyId]: { x: 4, y: 5 } },
    })).not.toBe(original);
  });

  it('keeps combat position changes durable', () => {
    const base = {
      ...createChroniclesState(),
      phase: 'combat',
      initiative: {
        version: 1,
        die: '1d8',
        round: 1,
        cursor: 0,
        order: [
          { id: 'matthias', kind: 'party', name: 'Matthias', agility: 4, roll: 5, initiative: 9 },
        ],
      },
    };

    expect(chroniclesTacticsCheckpointFingerprint({ ...base, x: 2 })).not.toBe(
      chroniclesTacticsCheckpointFingerprint(base),
    );
  });
});
