import { describe, expect, it } from 'vitest';
import {
  buildPlayerModel,
  PATTERN_IMPROVEMENT_STATES,
} from './playerModel.js';

const INCIDENT = 'human:MISSED_MATE';
const paidPuzzles = [
  {
    id: 'p1',
    source: 'autopsy',
    sourceGameId: 'source-1',
    incidentKeys: [INCIDENT],
    cleanSolves: 1,
    lastCleanAt: '2026-09-10T10:00:00Z',
  },
  {
    id: 'p2',
    source: 'autopsy',
    sourceGameId: 'source-2',
    incidentKeys: [INCIDENT],
    cleanSolves: 1,
    lastCleanAt: '2026-09-11T10:00:00Z',
  },
];

function covered(gameId, day, incidentKeys = []) {
  return {
    version: 1,
    gameId,
    date: `2026-09-${String(day).padStart(2, '0')}T12:00:00Z`,
    sufficientSample: true,
    clean: incidentKeys.length === 0,
    incidentCoverageVersion: 1,
    incidentCoverageSufficient: true,
    incidentKeys,
  };
}

function improvementState(cleanGamesAfterRelapse) {
  const cleanGameRecords = {
    relapse: covered('relapse', 12, [INCIDENT]),
  };
  for (let index = 0; index < cleanGamesAfterRelapse; index += 1) {
    cleanGameRecords[`clean-${index + 1}`] = covered(`clean-${index + 1}`, 13 + index);
  }
  return buildPlayerModel({ personalPuzzles: paidPuzzles, cleanGameRecords }).recurringErrors[0].improvementState;
}

describe('Player Model longitudinal recovery after relapse', () => {
  it('uses the current clean observation streak instead of making any historical relapse permanent', () => {
    expect(improvementState(0)).toBe(PATTERN_IMPROVEMENT_STATES.STILL_OCCURRING);
    expect(improvementState(1)).toBe(PATTERN_IMPROVEMENT_STATES.STILL_OCCURRING);
    expect(improvementState(2)).toBe(PATTERN_IMPROVEMENT_STATES.PROBABLE_IMPROVEMENT);
    expect(improvementState(5)).toBe(PATTERN_IMPROVEMENT_STATES.CORRECTED_WITH_SUFFICIENT_SAMPLE);
  });
});
