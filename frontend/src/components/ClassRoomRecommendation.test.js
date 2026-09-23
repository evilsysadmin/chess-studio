import { describe, expect, it } from 'vitest';
import { classRoomEntryRecommendation } from './ClassRoomRecommendation.js';
import { PATTERN_IMPROVEMENT_STATES } from '../playerModel.js';

function pattern(overrides = {}) {
  return {
    incidentKey: 'cpu:KNIGHT_FORK',
    label: 'Horquillas de caballo sufridas',
    positions: 3,
    pending: 2,
    sourceGames: 2,
    maxLoss: 420,
    improvementState: PATTERN_IMPROVEMENT_STATES.STILL_OCCURRING,
    filter: { incidentKey: 'cpu:KNIGHT_FORK' },
    ...overrides,
  };
}

describe('Class Room factual entry recommendation', () => {
  it('uses a recurring pattern only when there are real pending positions', () => {
    expect(classRoomEntryRecommendation({ recurringErrors: [pattern()] })).toMatchObject({
      incidentKey: 'cpu:KNIGHT_FORK',
      positions: 3,
      pending: 2,
      filter: { incidentKey: 'cpu:KNIGHT_FORK' },
    });
  });

  it('does not diagnose from a single position', () => {
    expect(classRoomEntryRecommendation({ recurringErrors: [pattern({ positions: 1 })] })).toBeNull();
  });

  it('does not advertise already corrected or fully trained patterns', () => {
    expect(classRoomEntryRecommendation({
      recurringErrors: [pattern({ improvementState: PATTERN_IMPROVEMENT_STATES.CORRECTED_WITH_SUFFICIENT_SAMPLE })],
    })).toBeNull();
    expect(classRoomEntryRecommendation({ recurringErrors: [pattern({ pending: 0 })] })).toBeNull();
  });

  it('falls through to the next actionable factual pattern', () => {
    const recommendation = classRoomEntryRecommendation({
      recurringErrors: [
        pattern({ pending: 0 }),
        pattern({ incidentKey: 'human:MISSED_MATE', label: 'Mates que dejaste escapar', filter: { incidentKey: 'human:MISSED_MATE' } }),
      ],
    });
    expect(recommendation?.incidentKey).toBe('human:MISSED_MATE');
  });
});
