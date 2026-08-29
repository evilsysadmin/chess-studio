import { beforeEach, describe, expect, it } from 'vitest';
import { adaptivePersonalPuzzle, rankAdaptivePersonalPuzzles } from './personalPuzzles.js';

const NOW = Date.parse('2026-08-30T12:00:00Z');
const FEN = '7k/8/6K1/8/8/8/8/R7 w - - 0 1';

function puzzle(id, overrides = {}) {
  return {
    id,
    kind: 'personal',
    source: 'autopsy',
    fen: FEN,
    solution: ['Ra8#'],
    loss: 120,
    attempts: 0,
    solves: 0,
    cleanSolves: 0,
    createdAt: '2026-08-20T12:00:00Z',
    incidentKeys: [],
    ...overrides,
  };
}

describe('ruta adaptativa de puzzles personales', () => {
  beforeEach(() => localStorage.clear());

  it('prioriza errores graves y reincidentes usando sólo evidencia guardada', () => {
    const ranked = rankAdaptivePersonalPuzzles([
      puzzle('mate-grave', { loss: 360, incidentKeys: ['human:MISSED_MATE'], opening: 'Defensa Siciliana' }),
      puzzle('mate-repetido', { loss: 260, incidentKeys: ['human:MISSED_MATE'], opening: 'Defensa Siciliana' }),
      puzzle('fork-menor', { loss: 110, incidentKeys: ['cpu:KNIGHT_FORK'], opening: 'Apertura Italiana' }),
    ], { now: NOW });

    expect(ranked[0].id).toBe('mate-grave');
    expect(ranked.at(-1).id).toBe('fork-menor');
  });

  it('sube en la cola un caso que ya se ha resistido frente a otro equivalente sin intentar', () => {
    const ranked = rankAdaptivePersonalPuzzles([
      puzzle('se-resiste', { loss: 160, attempts: 3, lastAttemptAt: '2026-08-29T12:00:00Z' }),
      puzzle('nuevo', { loss: 160, attempts: 0 }),
    ], { now: NOW });

    expect(ranked[0].id).toBe('se-resiste');
  });

  it('al pasar al siguiente alterna patrón cuando las prioridades están cerca', () => {
    const current = puzzle('actual', { loss: 230, incidentKeys: ['human:MISSED_MATE'] });
    const ranked = rankAdaptivePersonalPuzzles([
      current,
      puzzle('otro-mate', { loss: 220, incidentKeys: ['human:MISSED_MATE'] }),
      puzzle('fork', { loss: 210, incidentKeys: ['cpu:KNIGHT_FORK'] }),
    ], { excludeId: current.id, now: NOW });

    expect(ranked[0].id).toBe('fork');
  });

  it('la diversidad no tapa una cagada objetivamente mucho más grave', () => {
    const current = puzzle('actual', { loss: 220, incidentKeys: ['human:MISSED_MATE'] });
    const ranked = rankAdaptivePersonalPuzzles([
      current,
      puzzle('mate-catastrofico', { loss: 600, incidentKeys: ['human:MISSED_MATE'] }),
      puzzle('fork-leve', { loss: 100, incidentKeys: ['cpu:KNIGHT_FORK'] }),
    ], { excludeId: current.id, now: NOW });

    expect(ranked[0].id).toBe('mate-catastrofico');
  });

  it('respeta filtros explícitos y mantiene los dominados fuera de la cola normal', () => {
    localStorage.setItem('chess-study-personal-puzzles', JSON.stringify([
      puzzle('siciliana', { opening: 'Defensa Siciliana', incidentKeys: ['human:MISSED_MATE'], loss: 500 }),
      puzzle('italiana', { opening: 'Apertura Italiana', incidentKeys: ['cpu:KNIGHT_FORK'], loss: 100 }),
      puzzle('francesa-dominada', {
        opening: 'Defensa Francesa',
        loss: 700,
        attempts: 1,
        solves: 1,
        cleanSolves: 1,
        masteredAt: '2026-08-25T12:00:00Z',
      }),
    ]));

    expect(adaptivePersonalPuzzle(null, { opening: 'Apertura Italiana' }, { now: NOW })?.id).toBe('italiana');
    expect(adaptivePersonalPuzzle(null, { incidentKey: 'human:MISSED_MATE' }, { now: NOW })?.id).toBe('siciliana');
    expect(adaptivePersonalPuzzle(null, { opening: 'Defensa Francesa' }, { now: NOW })).toBeNull();
    expect(adaptivePersonalPuzzle(null, { opening: 'Defensa Francesa' }, { fallbackToMastered: true, now: NOW })?.id).toBe('francesa-dominada');
  });

  it('es determinista cuando dos casos tienen exactamente el mismo valor', () => {
    const ranked = rankAdaptivePersonalPuzzles([
      puzzle('b-caso'),
      puzzle('a-caso'),
    ], { now: NOW });

    expect(ranked.map((item) => item.id)).toEqual(['a-caso', 'b-caso']);
  });
});
