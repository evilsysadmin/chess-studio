import { describe, expect, it } from 'vitest';
import {
  chroniclesProgressionFeedback,
  chroniclesProgressionFeedbackLabel,
} from './chroniclesProgressionFeedback.js';

describe('Chronicles progression feedback', () => {
  it('groups repeated XP awards by hero without losing the reasons', () => {
    const feedback = chroniclesProgressionFeedback({
      awards: [
        { memberId: 'matthias', xp: 2, reason: 'daño útil' },
        { memberId: 'matthias', xp: 2, reason: 'daño útil' },
        { memberId: 'matthias', xp: 16, reason: 'baja' },
        { memberId: 'bishop', xp: 4, reason: 'soporte efectivo' },
      ],
      levelUps: [],
    });

    expect(feedback.totalXp).toBe(24);
    expect(feedback.hasRewards).toBe(true);
    expect(feedback.hasLevelUp).toBe(false);
    expect(feedback.heroes).toEqual([
      {
        memberId: 'matthias',
        xp: 20,
        reasons: ['daño útil', 'baja'],
        leveledUp: false,
        fromLevel: null,
        toLevel: null,
      },
      {
        memberId: 'bishop',
        xp: 4,
        reasons: ['soporte efectivo'],
        leveledUp: false,
        fromLevel: null,
        toLevel: null,
      },
    ]);
  });

  it('collapses multi-level gains into one visible level-up event', () => {
    const feedback = chroniclesProgressionFeedback({
      awards: [{ memberId: 'rook', xp: 120, reason: 'objetivo' }],
      levelUps: [
        { memberId: 'rook', from: 1, to: 2 },
        { memberId: 'rook', from: 2, to: 3 },
      ],
    });

    expect(feedback.hasLevelUp).toBe(true);
    expect(feedback.heroes[0]).toMatchObject({
      memberId: 'rook',
      xp: 120,
      leveledUp: true,
      fromLevel: 1,
      toLevel: 3,
    });
  });

  it('formats a compact reward line without owning hero-name data', () => {
    const feedback = chroniclesProgressionFeedback({
      awards: [
        { memberId: 'matthias', xp: 10, reason: 'baja' },
        { memberId: 'bishop', xp: 4, reason: 'soporte' },
      ],
      levelUps: [{ memberId: 'matthias', from: 2, to: 3 }],
    });

    expect(chroniclesProgressionFeedbackLabel(feedback, (id) => ({
      matthias: 'Matthias',
      bishop: 'Aziz',
    }[id]))).toBe('Matthias · +10 XP · NIVEL 3 · Aziz · +4 XP');
  });

  it('is silent for empty or malformed result data', () => {
    expect(chroniclesProgressionFeedback(null)).toMatchObject({
      totalXp: 0,
      hasRewards: false,
      hasLevelUp: false,
      heroes: [],
    });
    expect(chroniclesProgressionFeedbackLabel(chroniclesProgressionFeedback({
      awards: [{ memberId: '', xp: 9 }, { memberId: 'rook', xp: 0 }],
      levelUps: [{ memberId: 'rook', from: 3, to: 3 }],
    }))).toBe('');
  });
});
