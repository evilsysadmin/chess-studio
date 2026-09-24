import { beforeEach, describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import {
  MATTHIAS_SCHOOL_COURSES,
  MATTHIAS_SCHOOL_KEY,
  MATTHIAS_SCHOOL_LESSONS,
  MATTHIAS_SCHOOL_REFERENCES,
  isSchoolCourseAccessible,
  isSchoolCourseUnlocked,
  isSchoolLessonAccessible,
  isSchoolLessonUnlocked,
  loadMatthiasSchoolProgress,
  markMatthiasSchoolLessonComplete,
  matthiasSchoolCourseSummary,
  matthiasSchoolSummary,
  schoolExamForCourse,
  schoolLessonsForCourse,
  schoolBoardGuideMove,
  schoolLessonMetadata,
  schoolLineForLesson,
  validateMatthiasSchoolMove,
} from './matthiasSchool.js';

describe('Escuela de Matthias', () => {
  beforeEach(() => localStorage.clear());

  it('organiza siete cursos progresivos y cada uno termina en examen', () => {
    expect(MATTHIAS_SCHOOL_COURSES.map((course) => course.label)).toEqual(['Básico', 'Básico-medio', 'Medio', 'Medio-avanzado', 'Avanzado', 'Estrategia', 'Finales']);
    expect(MATTHIAS_SCHOOL_LESSONS.length).toBeGreaterThanOrEqual(35);
    for (const course of MATTHIAS_SCHOOL_COURSES) {
      const lessons = schoolLessonsForCourse(course.id);
      expect(lessons.length, course.id).toBeGreaterThanOrEqual(3);
      expect(lessons.at(-1)?.exam, `${course.id} debe acabar en examen`).toBe(true);
      expect(schoolExamForCourse(course.id)?.maxMistakes).toBeGreaterThanOrEqual(0);
    }
  });


  it('expone metadatos pedagógicos y referencias sin copiar contenido externo', () => {
    const strategy = MATTHIAS_SCHOOL_LESSONS.find((lesson) => lesson.id === 'open-file-tempo');
    expect(schoolLessonMetadata(strategy)).toMatchObject({
      difficulty: 6,
      discipline: 'strategy',
      concept: 'open-file',
      referenceId: 'lasker-strategy',
    });
    expect(MATTHIAS_SCHOOL_REFERENCES['capablanca-fundamentals']).toMatchObject({ kind: 'public-domain' });
    expect(MATTHIAS_SCHOOL_REFERENCES['lasker-strategy']).toMatchObject({ kind: 'public-domain' });
    expect(schoolLessonsForCourse('strategy')).toHaveLength(9);
    expect(schoolLessonsForCourse('endgames')).toHaveLength(14);
  });

  it('incluye técnica teórica de finales y una Lucena completa, no sólo movimientos sueltos', () => {
    const lucena = MATTHIAS_SCHOOL_LESSONS.find((lesson) => lesson.id === 'lucena-bridge');
    const philidor = MATTHIAS_SCHOOL_LESSONS.find((lesson) => lesson.id === 'philidor-fence');
    expect(schoolLessonMetadata(lucena)).toMatchObject({ discipline: 'endgame', concept: 'lucena' });
    expect(schoolLineForLesson(lucena).filter((step) => !step.auto)).toHaveLength(7);
    expect(new Chess(philidor.fen).turn()).toBe('b');
    expect(schoolLineForLesson(philidor)[0]).toMatchObject({ from: 'a6', to: 'c6', auto: false });
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


  it('guía sobre el tablero sin regalar respuestas en los exámenes', () => {
    const lesson = MATTHIAS_SCHOOL_LESSONS.find((item) => item.id === 'pawn-double-step');
    const expected = { from: 'e2', to: 'e4' };
    expect(schoolBoardGuideMove(lesson, expected)).toEqual({ from: 'e2' });
    expect(schoolBoardGuideMove(lesson, expected, { hintActive: true })).toEqual({ from: 'e2', to: 'e4' });

    const exam = MATTHIAS_SCHOOL_LESSONS.find((item) => item.id === 'mate-one');
    expect(schoolBoardGuideMove(exam, { from: 'f7', to: 'g7' }, { hintActive: true })).toBeNull();
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

  it('mantiene la ruta guiada estricta aunque el estudio libre complete material posterior', () => {
    let progress = loadMatthiasSchoolProgress();
    const strategyExam = schoolExamForCourse('strategy');

    expect(isSchoolCourseAccessible(progress, 'strategy')).toBe(false);
    expect(isSchoolCourseAccessible(progress, 'strategy', { freeStudy: true })).toBe(true);
    expect(isSchoolLessonAccessible(progress, schoolLessonsForCourse('endgames')[0].id)).toBe(false);
    expect(isSchoolLessonAccessible(progress, schoolLessonsForCourse('endgames')[0].id, { freeStudy: true })).toBe(true);

    progress = markMatthiasSchoolLessonComplete(strategyExam.id, new Date('2026-09-24T00:00:00Z'));
    expect(isSchoolCourseUnlocked(progress, 'endgames')).toBe(false);
    expect(isSchoolCourseAccessible(progress, 'endgames', { freeStudy: true })).toBe(true);
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
