import { describe, expect, it } from 'vitest';
import {
  advanceSchoolCoachContext,
  schoolCoachHintMessage,
  schoolCoachMissMessage,
  schoolCoachSelectionMessage,
  schoolCoachStepMessage,
} from './SchoolCoach.js';

describe('Class Room contextual Matthias', () => {
  it('counts repeated incident kinds without mixing different errors', () => {
    const first = advanceSchoolCoachContext(null, 'empty-square');
    const repeated = advanceSchoolCoachContext(first, 'empty-square');
    const changed = advanceSchoolCoachContext(repeated, 'wrong-piece');
    expect(first).toEqual({ kind: 'empty-square', count: 1 });
    expect(repeated).toEqual({ kind: 'empty-square', count: 2 });
    expect(changed).toEqual({ kind: 'wrong-piece', count: 1 });
  });

  it('may reference the expected origin during an ordinary guided lesson', () => {
    const text = schoolCoachMissMessage({
      lesson: { exam: false },
      kind: 'wrong-piece',
      square: 'a1',
      expected: { from: 'e2', to: 'e4' },
      revealExpected: true,
    });
    expect(text).toContain('a1');
    expect(text).toContain('e2');
  });

  it('never leaks expected coordinates in an exam', () => {
    const expected = { from: 'f7', to: 'g7' };
    for (const kind of ['empty-square', 'wrong-piece', 'off-objective']) {
      const text = schoolCoachMissMessage({
        lesson: { exam: true },
        kind,
        square: 'a1',
        selected: 'f7',
        expected,
        repeatCount: 2,
        revealExpected: true,
      });
      expect(text).not.toContain('f7');
      expect(text).not.toContain('g7');
    }
  });

  it('never leaks expected coordinates when guidance is disabled', () => {
    const text = schoolCoachMissMessage({
      lesson: { exam: false },
      kind: 'off-objective',
      expected: { from: 'e2', to: 'e4' },
      repeatCount: 2,
      revealExpected: false,
    });
    expect(text).not.toContain('e2');
    expect(text).not.toContain('e4');
    expect(text).toContain('Legal no significa útil');
  });

  it('acknowledges a real recovery without inventing history', () => {
    expect(schoolCoachSelectionMessage({ square: 'e2', hadRecentMiss: true, step: 1, totalMoves: 2 })).toContain('Ahora sí');
    expect(schoolCoachStepMessage({ recovered: true, nextStep: 2, totalMoves: 3 })).toContain('tropiezo anterior');
  });

  it('keeps the curated hint in the reply', () => {
    expect(schoolCoachHintMessage({ hint: 'Mira e2 y e4.' })).toContain('Mira e2 y e4.');
  });
});
