import { describe, expect, it } from 'vitest';
import { MATTHIAS_SCHOOL_LESSONS } from './matthiasSchool.js';
import {
  SCHOOL_CATALOG_DEPTHS,
  SCHOOL_CATALOG_DISCIPLINES,
  schoolCatalogEntry,
  schoolCatalogFacets,
  schoolCatalogLessons,
} from './schoolCatalog.js';

describe('Class Room topic catalog', () => {
  it('indexes every lesson without duplicating or losing curriculum content', () => {
    const entries = schoolCatalogLessons();
    expect(entries).toHaveLength(MATTHIAS_SCHOOL_LESSONS.length);
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length);
  });

  it('groups the curriculum into useful chess disciplines', () => {
    expect(SCHOOL_CATALOG_DISCIPLINES.map((item) => item.id)).toEqual([
      'fundamentals',
      'opening',
      'tactics',
      'calculation',
      'strategy',
      'endgame',
    ]);
    expect(schoolCatalogLessons({ discipline: 'strategy' }).some((entry) => entry.id === 'open-file-tempo')).toBe(true);
    expect(schoolCatalogLessons({ discipline: 'endgame' }).some((entry) => entry.id === 'lucena-bridge')).toBe(true);
    expect(schoolCatalogLessons({ discipline: 'calculation' }).some((entry) => entry.id === 'opera-finale')).toBe(true);
  });

  it('offers novice, club and expert depth bands derived from real course difficulty', () => {
    expect(SCHOOL_CATALOG_DEPTHS.map((item) => item.id)).toEqual(['starter', 'club', 'expert']);
    expect(schoolCatalogLessons({ depth: 'starter' }).every((entry) => entry.difficulty <= 2)).toBe(true);
    expect(schoolCatalogLessons({ depth: 'club' }).every((entry) => entry.difficulty >= 3 && entry.difficulty <= 5)).toBe(true);
    expect(schoolCatalogLessons({ depth: 'expert' }).every((entry) => entry.difficulty >= 6)).toBe(true);
    expect(schoolCatalogLessons({ depth: 'expert' }).some((entry) => entry.id === 'lucena-bridge')).toBe(true);
  });

  it('can hide promotion exams when the UI wants a pure study browser', () => {
    const withoutExams = schoolCatalogLessons({ includeExams: false });
    expect(withoutExams.some((entry) => entry.exam)).toBe(false);
    expect(withoutExams.length).toBeLessThan(MATTHIAS_SCHOOL_LESSONS.length);
  });

  it('keeps provenance and concept metadata available to the browser', () => {
    expect(schoolCatalogEntry(MATTHIAS_SCHOOL_LESSONS.find((lesson) => lesson.id === 'lucena-bridge'))).toMatchObject({
      discipline: 'endgame',
      concept: 'lucena',
      depthId: 'expert',
      referenceId: 'practice-taxonomy',
    });
  });

  it('reports filter counts from the same source of truth as the lessons', () => {
    const facets = schoolCatalogFacets();
    expect(facets.total).toBe(MATTHIAS_SCHOOL_LESSONS.length);
    expect(facets.disciplines.reduce((sum, item) => sum + item.count, 0)).toBe(facets.total);
    expect(facets.depths.reduce((sum, item) => sum + item.count, 0)).toBe(facets.total);
  });
});
