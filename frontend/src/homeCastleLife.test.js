import { describe, expect, it } from 'vitest';
import { buildHomeCastleLife, homeCastleAmbient, homeCastleMemory } from './homeCastleLife.js';

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
  });

  it('prefers a real streak milestone over aggregate wins', () => {
    expect(homeCastleMemory({ record: { wins: 18, bestHumanStreak: 6 } })).toEqual({
      kind: 'standard',
      title: 'Estandarte de la racha',
      detail: 'Récord real: 6 victorias seguidas contra Matthias.',
    });
  });

  it('uses real aggregate wins when no streak qualifies', () => {
    expect(homeCastleMemory({ record: { wins: 12, bestHumanStreak: 3 } })).toEqual({
      kind: 'trophy',
      title: 'Trofeo de rivalidad',
      detail: '12 victorias registradas contra Matthias.',
    });
  });

  it('builds the ambient and memory model without inventing extra state', () => {
    expect(buildHomeCastleLife({
      rivalry: { record: { wins: 10, bestHumanStreak: 2 } },
      now: { getHours: () => 8 },
    })).toEqual({
      ambient: 'dawn',
      memory: {
        kind: 'trophy',
        title: 'Trofeo de rivalidad',
        detail: '10 victorias registradas contra Matthias.',
      },
    });
  });
});
