import { describe, expect, it } from 'vitest';
import { latestTrainingImprovement } from './matthiasTrainingImprovement.js';

const NOW = Date.parse('2026-09-13T10:00:00Z');

function autopsy(id, overrides = {}) {
  return {
    id,
    source: 'autopsy',
    sourceGameId: `game-${id}`,
    incidentKeys: ['cpu:KNIGHT_FORK'],
    createdAt: '2026-09-10T10:00:00Z',
    cleanSolves: 0,
    ...overrides,
  };
}

describe('Matthias · mejora factual de entrenamiento', () => {
  it('reconoce una deuda sólo cuando los dos casos recientes están limpios y fechados', () => {
    const improvement = latestTrainingImprovement([
      autopsy('new', { createdAt: '2026-09-12T10:00:00Z', cleanSolves: 1, lastCleanAt: '2026-09-13T09:00:00Z' }),
      autopsy('previous', { createdAt: '2026-09-11T10:00:00Z', cleanSolves: 1, lastCleanAt: '2026-09-12T09:00:00Z' }),
      autopsy('old-dirty', { createdAt: '2026-09-01T10:00:00Z' }),
    ], { now: NOW });

    expect(improvement).toMatchObject({
      kind: 'debt-paid',
      fingerprint: 'debt-paid:cpu:KNIGHT_FORK:new,previous',
      at: '2026-09-13T09:00:00.000Z',
      label: 'Horquillas de caballo sufridas',
      cases: 3,
    });
  });

  it('no convierte progreso legacy sin fecha limpia en una mejora narrable', () => {
    expect(latestTrainingImprovement([
      autopsy('a', { cleanSolves: 1 }),
      autopsy('b', { cleanSolves: 1 }),
    ], { now: NOW })).toBeNull();
  });

  it('prefiere una retención 3/7/21 completada si es el hecho más reciente', () => {
    const improvement = latestTrainingImprovement([
      autopsy('a', { cleanSolves: 1, lastCleanAt: '2026-09-12T08:00:00Z' }),
      autopsy('b', { cleanSolves: 1, lastCleanAt: '2026-09-12T09:00:00Z' }),
      autopsy('retained', {
        incidentKeys: ['human:MISSED_MATE'],
        title: 'Mate que dejaste escapar',
        cleanSolves: 3,
        lastCleanAt: '2026-09-13T08:00:00Z',
        retentionCompletedAt: '2026-09-13T09:30:00Z',
      }),
    ], { now: NOW });

    expect(improvement).toMatchObject({
      kind: 'retention-completed',
      fingerprint: 'retention-completed:retained',
      title: 'Mate que dejaste escapar',
      at: '2026-09-13T09:30:00.000Z',
    });
  });

  it('no resucita mejoras viejas ni anteriores a la última aparición de Matthias', () => {
    const puzzles = [
      autopsy('a', { cleanSolves: 1, lastCleanAt: '2026-09-01T08:00:00Z' }),
      autopsy('b', { cleanSolves: 1, lastCleanAt: '2026-09-01T09:00:00Z' }),
    ];
    expect(latestTrainingImprovement(puzzles, { now: NOW, maxAgeMs: 24 * 60 * 60 * 1000 })).toBeNull();

    const recent = [
      autopsy('a', { cleanSolves: 1, lastCleanAt: '2026-09-13T08:00:00Z' }),
      autopsy('b', { cleanSolves: 1, lastCleanAt: '2026-09-13T09:00:00Z' }),
    ];
    expect(latestTrainingImprovement(recent, { now: NOW, afterMs: Date.parse('2026-09-13T09:05:00Z') })).toBeNull();
  });
});
