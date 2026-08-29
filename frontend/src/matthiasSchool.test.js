import { beforeEach, describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import {
  MATTHIAS_SCHOOL_KEY,
  MATTHIAS_SCHOOL_LESSONS,
  loadMatthiasSchoolProgress,
  markMatthiasSchoolLessonComplete,
  matthiasSchoolSummary,
  validateMatthiasSchoolMove,
} from './matthiasSchool.js';

describe('Escuela de Matthias', () => {
  beforeEach(() => localStorage.clear());

  it('cada ejercicio tiene una solución legal y concreta sobre su FEN', () => {
    expect(MATTHIAS_SCHOOL_LESSONS.length).toBeGreaterThanOrEqual(8);
    const ids = new Set();
    for (const lesson of MATTHIAS_SCHOOL_LESSONS) {
      expect(ids.has(lesson.id)).toBe(false);
      ids.add(lesson.id);
      const chess = new Chess(lesson.fen);
      const move = chess.move({ from: lesson.from, to: lesson.to, promotion: 'q' });
      expect(move, lesson.id).toBeTruthy();
      expect(validateMatthiasSchoolMove(lesson, lesson.from, lesson.to)).toMatchObject({ ok: true, reason: 'success' });
      expect(lesson.objective.length).toBeGreaterThan(12);
      expect(lesson.success.length).toBeGreaterThan(12);
      expect(lesson.hint.length).toBeGreaterThan(12);
    }
  });

  it('distingue una jugada legal que no resuelve el ejercicio', () => {
    const lesson = MATTHIAS_SCHOOL_LESSONS[0];
    expect(validateMatthiasSchoolMove(lesson, 'e2', 'e3')).toMatchObject({ ok: false, reason: 'legal-wrong' });
  });

  it('persiste progreso y calcula la siguiente lección sin inventar completados', () => {
    expect(loadMatthiasSchoolProgress()).toEqual({});
    const first = MATTHIAS_SCHOOL_LESSONS[0];
    markMatthiasSchoolLessonComplete(first.id, new Date('2026-08-29T10:00:00Z'));
    const stored = JSON.parse(localStorage.getItem(MATTHIAS_SCHOOL_KEY));
    expect(stored[first.id]).toMatchObject({ completed: true, attempts: 1, completedAt: '2026-08-29T10:00:00.000Z' });
    expect(matthiasSchoolSummary(stored)).toMatchObject({ completed: 1, total: MATTHIAS_SCHOOL_LESSONS.length, complete: false, nextLessonId: MATTHIAS_SCHOOL_LESSONS[1].id });
  });
});
