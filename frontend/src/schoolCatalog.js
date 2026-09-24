import {
  MATTHIAS_SCHOOL_COURSES,
  MATTHIAS_SCHOOL_LESSONS,
  schoolLessonMetadata,
} from './matthiasSchool.js';

export const SCHOOL_CATALOG_DISCIPLINES = Object.freeze([
  { id: 'fundamentals', label: 'Fundamentos' },
  { id: 'opening', label: 'Aperturas' },
  { id: 'tactics', label: 'Táctica' },
  { id: 'calculation', label: 'Cálculo' },
  { id: 'strategy', label: 'Estrategia' },
  { id: 'endgame', label: 'Finales' },
]);

export const SCHOOL_CATALOG_DEPTHS = Object.freeze([
  { id: 'starter', label: 'Primeros pasos', min: 1, max: 2 },
  { id: 'club', label: 'Jugador de club', min: 3, max: 5 },
  { id: 'expert', label: 'Profundidad experta', min: 6, max: 7 },
]);

const courseLabel = (courseId) => MATTHIAS_SCHOOL_COURSES.find((course) => course.id === courseId)?.label || courseId;

function depthForDifficulty(difficulty) {
  return SCHOOL_CATALOG_DEPTHS.find((depth) => difficulty >= depth.min && difficulty <= depth.max) || null;
}

export function schoolCatalogEntry(lesson) {
  if (!lesson) return null;
  const metadata = schoolLessonMetadata(lesson);
  const depth = depthForDifficulty(metadata?.difficulty || 1);
  return Object.freeze({
    id: lesson.id,
    title: lesson.title,
    eyebrow: lesson.eyebrow,
    courseId: lesson.courseId,
    courseLabel: courseLabel(lesson.courseId),
    difficulty: metadata?.difficulty || 1,
    discipline: metadata?.discipline || 'general',
    concept: metadata?.concept || null,
    depthId: depth?.id || null,
    depthLabel: depth?.label || null,
    exam: Boolean(lesson.exam),
    referenceId: metadata?.referenceId || null,
    referenceLabel: metadata?.reference?.label || null,
  });
}

export function schoolCatalogLessons({
  discipline = 'all',
  depth = 'all',
  includeExams = true,
} = {}) {
  return MATTHIAS_SCHOOL_LESSONS
    .map(schoolCatalogEntry)
    .filter(Boolean)
    .filter((entry) => discipline === 'all' || entry.discipline === discipline)
    .filter((entry) => depth === 'all' || entry.depthId === depth)
    .filter((entry) => includeExams || !entry.exam);
}

export function schoolCatalogFacets() {
  const entries = schoolCatalogLessons();
  return Object.freeze({
    total: entries.length,
    disciplines: Object.freeze(SCHOOL_CATALOG_DISCIPLINES.map((item) => Object.freeze({
      ...item,
      count: entries.filter((entry) => entry.discipline === item.id).length,
    }))),
    depths: Object.freeze(SCHOOL_CATALOG_DEPTHS.map((item) => Object.freeze({
      ...item,
      count: entries.filter((entry) => entry.depthId === item.id).length,
    }))),
  });
}
