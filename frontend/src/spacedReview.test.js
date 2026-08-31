import { describe, expect, it } from 'vitest';
import {
  SPACED_REVIEW_INTERVAL_DAYS,
  isPersonalPuzzleCurrentlyClean,
  personalSpacedReviewSummary,
  spacedReviewResultPatch,
  spacedReviewState,
} from './spacedReview.js';

const DAY = 86_400_000;
const START = Date.parse('2026-08-01T10:00:00.000Z');

function autopsy(overrides = {}) {
  return {
    id: 'case-a',
    source: 'autopsy',
    cleanSolves: 1,
    solves: 1,
    masteredAt: new Date(START).toISOString(),
    lastCleanAt: new Date(START).toISOString(),
    ...overrides,
  };
}

describe('repaso espaciado 3/7/21', () => {
  it('usa exactamente los intervalos 3, 7 y 21 días', () => {
    expect(SPACED_REVIEW_INTERVAL_DAYS).toEqual([3, 7, 21]);
    const puzzle = autopsy();
    expect(spacedReviewState(puzzle, START + (2 * DAY))).toMatchObject({ due: false, stage: 0, intervalDays: 3 });
    expect(spacedReviewState(puzzle, START + (3 * DAY))).toMatchObject({ due: true, stage: 0, intervalDays: 3 });
  });

  it('avanza 3 → 7 → 21 sólo cuando la cita ya ha vencido', () => {
    const initial = autopsy({ nextReviewAt: new Date(START + (3 * DAY)).toISOString() });

    const early = spacedReviewResultPatch(initial, { solved: true, clean: true, now: START + DAY });
    expect(early).not.toHaveProperty('retentionStage');
    expect(early).not.toHaveProperty('nextReviewAt');

    const after3 = { ...initial, ...spacedReviewResultPatch(initial, { solved: true, clean: true, now: START + (3 * DAY) }) };
    expect(after3.retentionStage).toBe(1);
    expect(after3.nextReviewAt).toBe(new Date(START + (10 * DAY)).toISOString());

    const after7 = { ...after3, ...spacedReviewResultPatch(after3, { solved: true, clean: true, now: START + (10 * DAY) }) };
    expect(after7.retentionStage).toBe(2);
    expect(after7.nextReviewAt).toBe(new Date(START + (31 * DAY)).toISOString());

    const after21 = { ...after7, ...spacedReviewResultPatch(after7, { solved: true, clean: true, now: START + (31 * DAY) }) };
    expect(after21.retentionStage).toBe(3);
    expect(after21.nextReviewAt).toBeNull();
    expect(after21.retentionCompletedAt).toBe(new Date(START + (31 * DAY)).toISOString());
    expect(spacedReviewState(after21, START + (100 * DAY))).toMatchObject({ completed: true, due: false });
  });

  it('una recaída invalida la limpieza vigente y el siguiente acierto reinicia desde 3 días', () => {
    const puzzle = autopsy({ nextReviewAt: new Date(START + (3 * DAY)).toISOString() });
    const failed = { ...puzzle, ...spacedReviewResultPatch(puzzle, { solved: false, clean: false, now: START + (3 * DAY) }) };

    expect(isPersonalPuzzleCurrentlyClean(failed)).toBe(false);
    expect(failed.nextReviewAt).toBeNull();
    expect(spacedReviewState(failed, START + (20 * DAY)).eligible).toBe(false);

    const recovered = {
      ...failed,
      cleanSolves: 2,
      ...spacedReviewResultPatch(failed, { solved: true, clean: true, now: START + (4 * DAY) }),
    };
    expect(isPersonalPuzzleCurrentlyClean(recovered)).toBe(true);
    expect(recovered.retentionStage).toBe(0);
    expect(recovered.nextReviewAt).toBe(new Date(START + (7 * DAY)).toISOString());
  });

  it('recupera puzzles limpios legacy sin inventar una migración de datos', () => {
    const legacy = autopsy({ lastCleanAt: undefined, nextReviewAt: undefined });
    expect(spacedReviewState(legacy, START + (3 * DAY))).toMatchObject({ eligible: true, due: true, stage: 0, intervalDays: 3 });
  });

  it('la cola sólo contiene autopsias reales limpias y separa vencidos de futuros', () => {
    const due = autopsy({ id: 'due', nextReviewAt: new Date(START + DAY).toISOString() });
    const future = autopsy({ id: 'future', nextReviewAt: new Date(START + (5 * DAY)).toISOString() });
    const ai = autopsy({ id: 'ai', source: 'workers-ai-validated', nextReviewAt: new Date(START).toISOString() });
    const broken = autopsy({ id: 'broken', retentionBrokenAt: new Date(START + DAY).toISOString(), nextReviewAt: null });

    const summary = personalSpacedReviewSummary([future, ai, broken, due], { now: START + (2 * DAY) });
    expect(summary.due.map((entry) => entry.puzzle.id)).toEqual(['due']);
    expect(summary.upcoming.map((entry) => entry.puzzle.id)).toEqual(['future']);
    expect(summary.dueCount).toBe(1);
    expect(summary.upcomingCount).toBe(1);
  });
});
