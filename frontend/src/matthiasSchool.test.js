import { beforeEach, describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import {
  MATTHIAS_SCHOOL_COURSES,
  MATTHIAS_SCHOOL_KEY,
  MATTHIAS_SCHOOL_LESSONS,
  isSchoolCourseUnlocked,
  isSchoolLessonUnlocked,
  loadMatthiasSchoolProgress,
  markMatthiasSchoolLessonComplete,
  matthiasSchoolCourseSummary,
  matthiasSchoolSummary,
  schoolExamForCourse,
  schoolLessonsForCourse,
  schoolLineForLesson,
  validateMatthiasSchoolMove,
} from './matthiasSchool.js';

describe('Escuela de Matthias', () => {
  beforeEach(() => localStorage.clear());

  it('organiza cinco cursos progresivos y cada uno termina en examen', () => {
    expect(MATTHIAS_SCHOOL_COURSES.map((course) => course.label)).toEqual(['Básico', 'Básico-medio', 'Medio', 'Medio-avanzado', 'Avanzado']);
    expect(MATTHIAS_SCHOOL_LESSONS.length).toBeGreaterThanOrEqual(20);
    for (const course of MATTHIAS_SCHOOL_COURSES) {
      const lessons = schoolLessonsForCourse(course.id);
      expect(lessons.length, course.id).toBeGreaterThanOrEqual(3);
      expect(lessons.at(-1)?.exam, `${course.id} debe acabar en examen`).toBe(true);
      expect(schoolExamForCourse(course.id)?.maxMistakes).toBeGreaterThanOrEqual(0);
    }
  });

  it('todas las secuencias de enseñanza son legales completas, incluidas respuestas automáticas', () => {
    const ids = new Set();
    for (const lesson of MATTHIAS_SCHOOL_LESSONS) {
      expect(ids.has(lesson.id)).toBe(false);
      ids.add(lesson.id);
      const line = schoolLineForLesson(lesson);
      expect(line.length, lesson.id).toBeGreaterThan(0);
      expect(line[0].auto, `${lesson.id} debe empezar con una decisión humana`).toBe(false);
      const chess = new Chess(lesson.fen);
      for (const [ply, step] of line.entries()) {
        const move = chess.move({ from: step.from, to: step.to, promotion: 'q' });
        expect(move, `${lesson.id} ply ${ply + 1}: ${step.from}-${step.to}`).toBeTruthy();
      }
      const first = line.find((step) => !step.auto);
      expect(validateMatthiasSchoolMove(lesson, first.from, first.to)).toMatchObject({ ok: true, reason: 'success' });
      expect(lesson.objective.length).toBeGreaterThan(12);
      expect(lesson.success.length).toBeGreaterThan(12);
      if (!lesson.exam) expect(lesson.hint?.length || 0).toBeGreaterThan(12);
    }
  });

  it('el enroque corto guiado mueve rey y torre y conserva O-O como jugada legal', () => {
    const lesson = MATTHIAS_SCHOOL_LESSONS.find((item) => item.id === 'castle-short');
    const chess = new Chess(lesson.fen);
    const target = chess.moves({ square: 'e1', verbose: true }).find((move) => move.to === 'g1');

    expect(target?.san).toBe('O-O');
    const move = chess.move({ from: 'e1', to: 'g1' });
    expect(move?.san).toBe('O-O');
    expect(chess.get('g1')).toMatchObject({ type: 'k', color: 'w' });
    expect(chess.get('f1')).toMatchObject({ type: 'r', color: 'w' });
    expect(chess.get('e1')).toBeUndefined();
    expect(chess.get('h1')).toBeUndefined();
  });

  it('incluye lecciones de varias jugadas y no se limita a mover una pieza una vez', () => {
    const multiHuman = MATTHIAS_SCHOOL_LESSONS.filter((lesson) => schoolLineForLesson(lesson).filter((step) => !step.auto).length >= 2);
    expect(multiHuman.length).toBeGreaterThanOrEqual(10);
    expect(MATTHIAS_SCHOOL_LESSONS.find((lesson) => lesson.id === 'opening-development')).toBeTruthy();
    expect(MATTHIAS_SCHOOL_LESSONS.find((lesson) => lesson.id === 'opera-finale')).toBeTruthy();
  });

  it('distingue una jugada legal que no resuelve el paso esperado', () => {
    const lesson = MATTHIAS_SCHOOL_LESSONS.find((item) => item.id === 'pawn-double-step');
    expect(validateMatthiasSchoolMove(lesson, 'e2', 'e3')).toMatchObject({ ok: false, reason: 'legal-wrong' });
  });

  it('bloquea cursos y lecciones hasta aprobar el examen anterior', () => {
    let progress = loadMatthiasSchoolProgress();
    expect(isSchoolCourseUnlocked(progress, 'basic')).toBe(true);
    expect(isSchoolCourseUnlocked(progress, 'basic-medium')).toBe(false);
    const basic = schoolLessonsForCourse('basic');
    expect(isSchoolLessonUnlocked(progress, basic[0].id)).toBe(true);
    expect(isSchoolLessonUnlocked(progress, basic[1].id)).toBe(false);

    for (const lesson of basic) progress = markMatthiasSchoolLessonComplete(lesson.id, new Date('2026-08-29T10:00:00Z'));
    expect(isSchoolCourseUnlocked(progress, 'basic-medium')).toBe(true);
    expect(isSchoolLessonUnlocked(progress, schoolLessonsForCourse('basic-medium')[0].id)).toBe(true);
  });

  it('persiste progreso, promociones y calcula el siguiente curso sin inventar completados', () => {
    expect(loadMatthiasSchoolProgress()).toEqual({});
    const first = MATTHIAS_SCHOOL_LESSONS[0];
    markMatthiasSchoolLessonComplete(first.id, new Date('2026-08-29T10:00:00Z'));
    const stored = JSON.parse(localStorage.getItem(MATTHIAS_SCHOOL_KEY));
    expect(stored[first.id]).toMatchObject({ completed: true, attempts: 1, completedAt: '2026-08-29T10:00:00.000Z' });
    expect(matthiasSchoolSummary(stored)).toMatchObject({ completed: 1, total: MATTHIAS_SCHOOL_LESSONS.length, complete: false, passedCourses: 0, currentCourseLabel: 'Básico', nextLessonId: MATTHIAS_SCHOOL_LESSONS[1].id });
    expect(matthiasSchoolCourseSummary('basic', stored)).toMatchObject({ completed: 1, passed: false, unlocked: true });
  });
});
