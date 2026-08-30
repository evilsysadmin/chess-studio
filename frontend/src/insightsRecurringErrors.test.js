import { describe, expect, it } from 'vitest';
import { buildRecurringErrorPatterns } from './insightsRecurringErrors.js';

describe('buildRecurringErrorPatterns', () => {
  it('sólo convierte en patrón los incidentes respaldados por al menos dos posiciones reales', () => {
    const patterns = buildRecurringErrorPatterns([
      {
        id: 'fork-1',
        source: 'autopsy',
        incidentKeys: ['cpu:KNIGHT_FORK'],
        sourceGameId: 'g1',
        loss: 180,
        attempts: 2,
        cleanSolves: 0,
        createdAt: '2026-08-29T10:00:00Z',
      },
      {
        id: 'fork-2',
        source: 'autopsy',
        incidentKeys: ['cpu:KNIGHT_FORK'],
        sourceGameId: 'g2',
        loss: 260,
        attempts: 1,
        cleanSolves: 1,
        solves: 1,
        masteredAt: '2026-08-30T10:00:00Z',
        createdAt: '2026-08-30T09:00:00Z',
      },
      {
        id: 'mate-singleton',
        source: 'autopsy',
        incidentKeys: ['human:MISSED_MATE'],
        sourceGameId: 'g3',
        loss: 400,
      },
    ]);

    expect(patterns).toHaveLength(1);
    expect(patterns[0]).toMatchObject({
      incidentKey: 'cpu:KNIGHT_FORK',
      label: 'Horquillas de caballo sufridas',
      positions: 2,
      pending: 1,
      sourceGames: 2,
      friction: 2,
      maxLoss: 260,
      debt: {
        progress: 1,
        target: 2,
        paid: false,
        active: true,
        realCases: 2,
        distinctGames: 2,
      },
      filter: { incidentKey: 'cpu:KNIGHT_FORK' },
    });
  });

  it('no cuenta dos veces la misma incidentKey dentro de una sola posición', () => {
    const patterns = buildRecurringErrorPatterns([
      { id: 'one', source: 'autopsy', incidentKeys: ['human:ALLOWED_MATE', 'human:ALLOWED_MATE'] },
      { id: 'two', source: 'autopsy', incidentKeys: ['human:ALLOWED_MATE'] },
    ]);

    expect(patterns).toHaveLength(1);
    expect(patterns[0].positions).toBe(2);
  });

  it('marca una deuda como pagada sólo con dos casos reales distintos resueltos limpiamente', () => {
    const [pattern] = buildRecurringErrorPatterns([
      { id: 'a1', source: 'autopsy', incidentKeys: ['human:STALEMATE_BLUNDER'], sourceGameId: 'g1', cleanSolves: 1, solves: 1 },
      { id: 'a2', source: 'autopsy', incidentKeys: ['human:STALEMATE_BLUNDER'], sourceGameId: 'g2', cleanSolves: 2, solves: 2 },
      { id: 'ai-variant', source: 'workers-ai-validated', incidentKeys: ['human:STALEMATE_BLUNDER'], cleanSolves: 0 },
    ]);

    expect(pattern.positions).toBe(3);
    expect(pattern.debt).toMatchObject({ progress: 2, target: 2, paid: true, active: false, realCases: 2 });
  });

  it('ordena primero la reincidencia más demostrada y no inventa patrones sin incidentKeys', () => {
    const patterns = buildRecurringErrorPatterns([
      { id: 'a1', incidentKeys: ['cpu:PAWN_FORK'] },
      { id: 'a2', incidentKeys: ['cpu:PAWN_FORK'] },
      { id: 'a3', incidentKeys: ['cpu:PAWN_FORK'] },
      { id: 'b1', incidentKeys: ['human:STALEMATE_BLUNDER'] },
      { id: 'b2', incidentKeys: ['human:STALEMATE_BLUNDER'] },
      { id: 'none-1' },
      { id: 'none-2', incidentKeys: [] },
    ]);

    expect(patterns.map((pattern) => pattern.incidentKey)).toEqual([
      'cpu:PAWN_FORK',
      'human:STALEMATE_BLUNDER',
    ]);
  });
});
