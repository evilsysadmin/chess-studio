import { describe, expect, it } from 'vitest';
import { buildSchoolPlayedMoveTrail } from './SchoolPlayedMoveTrail.js';
import { MATTHIAS_SCHOOL_LESSONS } from '../matthiasSchool.js';

const lesson = (id) => MATTHIAS_SCHOOL_LESSONS.find((entry) => entry.id === id);

describe('School played move trail', () => {
  it('never reveals future steps or the rival before their actual playback', () => {
    const opening = lesson('opening-development');
    expect(buildSchoolPlayedMoveTrail({ fen: opening.fen, line: opening.line, lineIndex: 0 })).toEqual([]);
    expect(buildSchoolPlayedMoveTrail({ fen: opening.fen, line: opening.line, lineIndex: 1 }))
      .toMatchObject([{ moveNumber: 1, san: 'e4', color: 'w', auto: false }]);
    expect(buildSchoolPlayedMoveTrail({ fen: opening.fen, line: opening.line, lineIndex: 2 }))
      .toMatchObject([
        { moveNumber: 1, san: 'e4', color: 'w', auto: false },
        { moveNumber: 1, san: 'e5', color: 'b', auto: true },
      ]);
  });

  it('reconstructs SAN, including captures, promotion and mate, from legal chess', () => {
    const capture = lesson('pawn-capture');
    expect(buildSchoolPlayedMoveTrail({ fen: capture.fen, line: capture.line, lineIndex: 1 })[0]?.san).toBe('exf3');
    const promo = lesson('promotion-capture');
    expect(buildSchoolPlayedMoveTrail({ fen: promo.fen, line: promo.line, lineIndex: 1 })[0]?.san).toMatch(/^gxh8=Q/);
    const exam = lesson('mate-one');
    expect(buildSchoolPlayedMoveTrail({ fen: exam.fen, line: exam.line, lineIndex: 0 })).toEqual([]);
    expect(buildSchoolPlayedMoveTrail({ fen: exam.fen, line: exam.line, lineIndex: 1 })[0]?.san).toBe('Qg7#');
  });

  it('respects the FEN move number and player orientation rather than assuming move one', () => {
    const later = lesson('ruy-castle-sequence');
    const moves = buildSchoolPlayedMoveTrail({ fen: later.fen, line: later.line, lineIndex: 2 });
    expect(moves).toMatchObject([
      { moveNumber: 3, san: 'Bb5', color: 'w', auto: false },
      { moveNumber: 3, san: 'a6', color: 'b', auto: true },
    ]);
  });

  it('fails closed for invalid FEN, cursor or an illegal previously played move', () => {
    const l = lesson('opening-development');
    const original = { fen: l.fen, line: l.line };
    expect(buildSchoolPlayedMoveTrail({ ...original, lineIndex: 5 })).toHaveLength(5);
    expect(buildSchoolPlayedMoveTrail({ ...original, lineIndex: -1 })).toEqual([]);
    expect(buildSchoolPlayedMoveTrail({ ...original, lineIndex: l.line.length + 1 })).toEqual([]);
    expect(buildSchoolPlayedMoveTrail({ fen: 'not fen', line: l.line, lineIndex: 1 })).toEqual([]);
    expect(buildSchoolPlayedMoveTrail({
      ...original,
      line: [{ from: 'e2', to: 'e5', auto: false }],
      lineIndex: 1,
    })).toEqual([]);
  });
});
