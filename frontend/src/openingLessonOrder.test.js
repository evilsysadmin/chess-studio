import { describe, expect, it } from 'vitest';
import { OPENING_LESSONS } from './openings-data.js';
import { orderOpeningLessons } from './openingLessonOrder.js';

describe('orderOpeningLessons', () => {
  it('muestra primero aperturas/gambitos y después defensas, ambos alfabéticos', () => {
    const ordered = orderOpeningLessons(OPENING_LESSONS);
    const firstDefense = ordered.findIndex((row) => row.title.startsWith('Defensa '));
    expect(firstDefense).toBeGreaterThan(0);
    expect(ordered.slice(0, firstDefense).every((row) => !row.title.startsWith('Defensa '))).toBe(true);
    expect(ordered.slice(firstDefense).every((row) => row.title.startsWith('Defensa '))).toBe(true);
    const collator = new Intl.Collator('es', { sensitivity: 'base' });
    expect(ordered.slice(0, firstDefense).map((row) => row.title)).toEqual(
      [...ordered.slice(0, firstDefense).map((row) => row.title)].sort(collator.compare),
    );
    expect(ordered.slice(firstDefense).map((row) => row.title)).toEqual(
      [...ordered.slice(firstDefense).map((row) => row.title)].sort(collator.compare),
    );
  });
});
