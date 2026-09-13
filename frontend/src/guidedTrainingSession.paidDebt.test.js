import { describe, expect, it } from 'vitest';
import { buildGuidedTrainingPlan } from './guidedTrainingSession.js';

const INCIDENT = 'cpu:KNIGHT_FORK';
const puzzlesWithOldPending = [
  { id: 'old-pending', source: 'autopsy', incidentKeys: [INCIDENT], cleanSolves: 0 },
  { id: 'recent-clean-1', source: 'autopsy', incidentKeys: [INCIDENT], cleanSolves: 1 },
  { id: 'recent-clean-2', source: 'autopsy', incidentKeys: [INCIDENT], cleanSolves: 1 },
];

function modelWithState(improvementState) {
  return {
    recurringErrors: [{
      incidentKey: INCIDENT,
      positions: 3,
      improvementState,
      debt: { progress: 2, target: 2, paid: true, active: false, realCases: 3 },
    }],
    trainingDebt: { top: null },
  };
}

describe('guided training after paying a recurring-error debt', () => {
  it('waits for a new real observation instead of resurrecting an older pending puzzle', () => {
    for (const improvementState of ['no-sample', 'probable-improvement', 'corrected-with-sufficient-sample']) {
      const plan = buildGuidedTrainingPlan({
        minutes: 15,
        history: [],
        puzzles: puzzlesWithOldPending,
        rivalry: {},
        playerModel: modelWithState(improvementState),
      });

      expect(plan.available).toBe(false);
      expect(plan.steps).toEqual([]);
    }
  });

  it('keeps unrelated pending material trainable while the paid pattern waits for observation', () => {
    const plan = buildGuidedTrainingPlan({
      minutes: 5,
      history: [],
      puzzles: [
        ...puzzlesWithOldPending,
        { id: 'other-pending', source: 'autopsy', incidentKeys: ['human:ALLOWED_MATE'], cleanSolves: 0 },
      ],
      rivalry: {},
      playerModel: modelWithState('no-sample'),
    });

    expect(plan.available).toBe(true);
    expect(plan.steps[0]).toMatchObject({
      id: 'personal-errors',
      kind: 'personal-errors',
      minutes: 4,
    });
    expect(plan.steps[0].detail).toContain('1 posición real pendiente');
  });
});
