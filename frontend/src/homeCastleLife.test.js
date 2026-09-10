import { describe, expect, it } from 'vitest';
import {
  buildHomeCastleLife,
  homeCastleAmbient,
  homeCastleDailyMemory,
  homeCastleMemories,
  homeCastleMemory,
  homeCastleRareSighting,
} from './homeCastleLife.js';

describe('homeCastleLife', () => {
  it('derives four deterministic local-time ambient states', () => {
    const at = (hour) => ({ getHours: () => hour });
    expect(homeCastleAmbient(at(6))).toBe('dawn');
    expect(homeCastleAmbient(at(12))).toBe('day');
    expect(homeCastleAmbient(at(19))).toBe('dusk');
    expect(homeCastleAmbient(at(23))).toBe('night');
  });

  it('stays silent when there is no meaningful factual milestone', () => {
    expect(homeCastleMemory({ record: { wins: 9, bestHumanStreak: 4 } })).toBeNull();
    expect(homeCastleMemory({ record: { games: 500, wins: 0, bestHumanStreak: 0 } })).toBeNull();
    expect(homeCastleMemory({ record: { wins: 'banana', bestHumanStreak: -4 } })).toBeNull();
    expect(homeCastleDailyMemory({ bestStreak: 6 })).toBeNull();
  });

  it('prefers a real rivalry streak milestone over aggregate wins', () => {
    expect(homeCastleMemory({ record: { wins: 18, bestHumanStreak: 6 } })).toEqual({
      id: 'rivalry-streak',
      kind: 'standard',
      destination: 'history',
      title: 'Estandarte de la racha',
      detail: 'Récord real: 6 victorias seguidas contra Matthias.',
    });
  });

  it('uses real aggregate wins when no rivalry streak qualifies', () => {
    expect(homeCastleMemory({ record: { wins: 12, bestHumanStreak: 3 } })).toEqual({
      id: 'rivalry-wins',
      kind: 'trophy',
      destination: 'history',
      title: 'Trofeo de rivalidad',
      detail: '12 victorias registradas contra Matthias.',
    });
  });

  it('adds a separate Daily Challenge memory only after a real seven-day best streak', () => {
    expect(homeCastleDailyMemory({ bestStreak: 11 })).toEqual({
      id: 'daily-streak',
      kind: 'daily-seal',
      destination: 'daily',
      title: 'Sello de constancia',
      detail: 'Mejor racha real del Desafío diario: 11 días.',
    });
    expect(homeCastleMemories({
      rivalry: { record: { wins: 12, bestHumanStreak: 3 } },
      dailyStats: { bestStreak: 11 },
    })).toHaveLength(2);
  });

  it('makes rare sightings deterministic and genuinely sparse', () => {
    const date = (year, month, day) => ({
      getFullYear: () => year,
      getMonth: () => month - 1,
      getDate: () => day,
    });
    expect(homeCastleRareSighting(date(2026, 2, 5))).toBe('gallery-glint');
    expect(homeCastleRareSighting(date(2026, 2, 6))).toBeNull();
  });

  it('builds ambient, factual memories and rare state without inventing data', () => {
    const now = {
      getHours: () => 8,
      getFullYear: () => 2026,
      getMonth: () => 1,
      getDate: () => 6,
    };
    const result = buildHomeCastleLife({
      rivalry: { record: { wins: 10, bestHumanStreak: 2 } },
      dailyStats: { bestStreak: 7 },
      now,
    });
    expect(result.ambient).toBe('dawn');
    expect(result.memories).toHaveLength(2);
    expect(result.memory?.id).toBe('rivalry-wins');
    expect(result.memories[1]?.id).toBe('daily-streak');
    expect(result.rareSighting).toBeNull();
  });
});
