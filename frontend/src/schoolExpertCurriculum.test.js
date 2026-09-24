import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import {
  MATTHIAS_SCHOOL_LESSONS,
  schoolLessonMetadata,
  schoolLineForLesson,
} from './matthiasSchool.js';
import { schoolCatalogLessons } from './schoolCatalog.js';

const IDS = [
  'zwischenzug-before-recapture',
  'clearance-discovered-check',
  'minority-break',
  'rook-side-check',
  'outside-passed-pawn',
  'reserve-tempo-opposition',
];

describe('Class Room · laboratorio experto', () => {
  it('incluye seis conceptos avanzados propios y navegables desde profundidad experta', () => {
    const expert = new Set(schoolCatalogLessons({ depth: 'expert' }).map((entry) => entry.id));
    for (const id of IDS) expect(expert.has(id), id).toBe(true);
    expect(schoolLessonMetadata(MATTHIAS_SCHOOL_LESSONS.find((lesson) => lesson.id === 'zwischenzug-before-recapture'))).toMatchObject({
      discipline: 'calculation',
      concept: 'zwischenzug',
    });
    expect(schoolLessonMetadata(MATTHIAS_SCHOOL_LESSONS.find((lesson) => lesson.id === 'reserve-tempo-opposition'))).toMatchObject({
      discipline: 'endgame',
      concept: 'reserve-tempo',
    });
  });

  it('valida de principio a fin todas las líneas del laboratorio experto', () => {
    for (const id of IDS) {
      const lesson = MATTHIAS_SCHOOL_LESSONS.find((item) => item.id === id);
      expect(lesson, id).toBeTruthy();
      const board = new Chess(lesson.fen);
      for (const [ply, step] of schoolLineForLesson(lesson).entries()) {
        expect(
          board.move({ from: step.from, to: step.to, promotion: 'q' }),
          `${id} ply ${ply + 1}: ${step.from}-${step.to}`,
        ).toBeTruthy();
      }
    }
  });

  it('mezcla cálculo de varias jugadas con planes estratégicos y técnica de finales', () => {
    const humanPlies = (id) => schoolLineForLesson(MATTHIAS_SCHOOL_LESSONS.find((lesson) => lesson.id === id))
      .filter((step) => !step.auto).length;
    expect(humanPlies('zwischenzug-before-recapture')).toBe(2);
    expect(humanPlies('clearance-discovered-check')).toBe(2);
    expect(humanPlies('reserve-tempo-opposition')).toBe(2);
    expect(schoolCatalogLessons({ discipline: 'calculation', depth: 'expert' }).map((entry) => entry.id)).toEqual(
      expect.arrayContaining(['zwischenzug-before-recapture', 'clearance-discovered-check']),
    );
  });
});
