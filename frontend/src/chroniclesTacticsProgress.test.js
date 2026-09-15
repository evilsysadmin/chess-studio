import { describe, expect, it } from 'vitest';
import {
  applyChroniclesXpAwards,
  createChroniclesTacticsProgress,
  normalizeChroniclesTacticsProgress,
} from './chroniclesTacticsProgress.js';

describe('Chronicles Tactics individual XP progress', () => {
  it('credits each factual event only once across reload/retry application', () => {
    const award = {
      id: 'crypt-01:kill:corrupted-pawn',
      heroId: 'rook',
      amount: 5,
      reason: 'Baja confirmada',
    };

    const first = applyChroniclesXpAwards(createChroniclesTacticsProgress(), [award]);
    expect(first.progress.heroes.rook.xp).toBe(5);
    expect(first.applied).toEqual([award]);

    const replayed = applyChroniclesXpAwards(first.progress, [award]);
    expect(replayed.progress.heroes.rook.xp).toBe(5);
    expect(replayed.applied).toEqual([]);
  });

  it('keeps XP individual and ignores malformed or unknown awards', () => {
    const result = applyChroniclesXpAwards(createChroniclesTacticsProgress(), [
      { id: 'damage-matthias', heroId: 'matthias', amount: 2, reason: 'Daño útil' },
      { id: 'support-aziz', heroId: 'bishop', amount: 4, reason: 'Soporte efectivo' },
      { id: 'ghost', heroId: 'ghost', amount: 99 },
      { id: '', heroId: 'rook', amount: 8 },
      { id: 'empty', heroId: 'rook', amount: 0 },
    ]);

    expect(result.progress.heroes.matthias.xp).toBe(2);
    expect(result.progress.heroes.bishop.xp).toBe(4);
    expect(result.progress.heroes.rook.xp).toBe(0);
    expect(result.progress.heroes.knight.xp).toBe(0);
    expect(result.applied).toHaveLength(2);
  });

  it('caps one malformed oversized award instead of trusting arbitrary state', () => {
    const result = applyChroniclesXpAwards(createChroniclesTacticsProgress(), [
      { id: 'oversized', heroId: 'matthias', amount: 999999, reason: 'Dato corrupto' },
    ]);
    expect(result.progress.heroes.matthias.xp).toBe(25);
    expect(result.applied[0].amount).toBe(25);
  });

  it('normalizes corrupt or future-shaped data without inventing progression', () => {
    expect(normalizeChroniclesTacticsProgress(null)).toEqual(createChroniclesTacticsProgress());
    expect(normalizeChroniclesTacticsProgress({
      version: 99,
      heroes: {
        matthias: { xp: '12.9' },
        rook: { xp: -8 },
        bishop: { xp: 'garbage' },
      },
      awardedEventIds: ['a', 'a', '', null, 'b'],
    })).toEqual({
      version: 1,
      heroes: {
        matthias: { xp: 12 },
        rook: { xp: 0 },
        bishop: { xp: 0 },
        knight: { xp: 0 },
      },
      awardedEventIds: ['a', 'b'],
    });
  });
});