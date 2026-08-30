import { describe, expect, it } from 'vitest';
import { buildRecurringErrorPatterns } from './insightsRecurringErrors.js';

describe('buildRecurringErrorPatterns', () => {
  it('sólo convierte en patrón los incidentes respaldados por al menos dos posiciones reales', () => {
    const patterns = buildRecurringErrorPatterns([
      {
        id: 'fork-1',
        incidentKeys: ['cpu:KNIGHT_FORK'],
        sourceGameId: 'g1',
        loss: 180,
        attempts: 2,
        cleanSolves: 0,
        createdAt: '2026-08-29T10:00:00Z',
      },
      {
        id: 'fork-2',
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
      filter: { incidentKey: 'cpu:KNIGHT_FORK' },
    });
  });

  it('no cuenta dos veces la misma incidentKey dentro de una sola posición', () => {
    const patterns = buildRecurringErrorPatterns([
      { id: 'one', incidentKeys: ['human:ALLOWED_MATE', 'human:ALLOWED_MATE'] },
      { id: 'two', incidentKeys: ['human:ALLOWED_MATE'] },
    ]);

    expect(patterns).toHaveLength(1);
    expect(patterns[0].positions).toBe(2);
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
