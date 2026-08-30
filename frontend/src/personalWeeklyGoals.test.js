import { describe, expect, it } from 'vitest';
import { buildPersonalWeeklyGoals, PERSONAL_WEEKLY_GOAL_WINDOW_MS } from './personalWeeklyGoals.js';

const NOW = Date.parse('2026-08-31T12:00:00Z');

function autopsy(id, incidentKey, extras = {}) {
  return {
    id,
    source: 'autopsy',
    sourceGameId: `game-${id}`,
    incidentKeys: [incidentKey],
    cleanSolves: 0,
    ...extras,
  };
}

describe('objetivos semanales personales', () => {
  it('prioriza una deuda real y conserva su progreso medido', () => {
    const goals = buildPersonalWeeklyGoals({
      now: NOW,
      cleanRecords: {},
      puzzles: [
        autopsy('fork-1', 'cpu:KNIGHT_FORK', { cleanSolves: 1, masteredAt: '2026-08-30T10:00:00Z' }),
        autopsy('fork-2', 'cpu:KNIGHT_FORK'),
      ],
    });

    expect(goals[0]).toMatchObject({
      kind: 'debt',
      progress: 1,
      target: 2,
      done: false,
      filter: { incidentKey: 'cpu:KNIGHT_FORK' },
    });
    expect(goals[0].title).toContain('Horquillas de caballo sufridas');
  });

  it('cuenta sólo partidas limpias demostradas dentro de la ventana de siete días', () => {
    const goals = buildPersonalWeeklyGoals({
      now: NOW,
      puzzles: [],
      cleanRecords: {
        recent1: { version: 1, sufficientSample: true, clean: true, date: '2026-08-30T10:00:00Z' },
        recent2: { version: 1, sufficientSample: true, clean: true, date: '2026-08-28T10:00:00Z' },
        old: { version: 1, sufficientSample: true, clean: true, date: new Date(NOW - PERSONAL_WEEKLY_GOAL_WINDOW_MS - 1000).toISOString() },
        dirty: { version: 1, sufficientSample: true, clean: false, date: '2026-08-29T10:00:00Z' },
        weak: { version: 1, sufficientSample: false, clean: true, date: '2026-08-29T10:00:00Z' },
      },
    });

    expect(goals).toHaveLength(1);
    expect(goals[0]).toMatchObject({ kind: 'clean-games', progress: 2, target: 2, done: true });
  });

  it('mide resoluciones limpias de puzzles personales y no suma datos viejos', () => {
    const goals = buildPersonalWeeklyGoals({
      now: NOW,
      cleanRecords: {},
      puzzles: [
        { id: 'p1', source: 'workers-ai-validated', cleanSolves: 1, masteredAt: '2026-08-30T10:00:00Z' },
        { id: 'p2', source: 'workers-ai-validated', cleanSolves: 1, masteredAt: '2026-08-29T10:00:00Z' },
        { id: 'p3', source: 'workers-ai-validated', cleanSolves: 1, masteredAt: '2026-08-01T10:00:00Z' },
        { id: 'p4', source: 'workers-ai-validated', cleanSolves: 0 },
      ],
    });

    expect(goals).toHaveLength(1);
    expect(goals[0]).toMatchObject({ kind: 'personal-puzzles', progress: 2, target: 3, done: false });
    expect(goals[0].detail).toContain('1 posición pendiente');
  });

  it('no inventa objetivos si no existe ningún dato personal que los respalde', () => {
    expect(buildPersonalWeeklyGoals({ now: NOW, puzzles: [], cleanRecords: {} })).toEqual([]);
  });
});
