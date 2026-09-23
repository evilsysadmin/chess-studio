import { describe, expect, it } from 'vitest';
import {
  advanceSchoolCoachContext,
  schoolCoachHintMessage,
  schoolCoachMissMessage,
  schoolCoachSelectionMessage,
  schoolCoachStepMessage,
} from './SchoolCoach.js';

describe('Class Room contextual Matthias', () => {
  it('counts repeated incident kinds without mixing unrelated mistakes', () => {
    const first = advanceSchoolCoachContext(null, 'empty-square');
    const second = advanceSchoolCoachContext(first, 'empty-square');
    const changed = advanceSchoolCoachContext(second, 'wrong-piece');
    expect(first).toEqual({ kind: 'empty-square', count: 1 });
    expect(second).toEqual({ kind: 'empty-square', count: 2 });
    expect(changed).toEqual({ kind: 'wrong-piece', count: 1 });
  });

  it('mentions real lesson coordinates outside exams', () => {
    const text = schoolCoachMissMessage({
      lesson: { exam: false },
      kind: 'wrong-piece',
      square: 'a1',
      expected: { from: 'e2', to: 'e4' },
      repeatCount: 1,
    });
    expect(text).toContain('a1');
    expect(text).toContain('e2');
  });

  it('does not leak the expected origin or destination during exams', () => {
    const expected = { from: 'f7', to: 'g7' };
    for (const kind of ['empty-square', 'wrong-piece', 'off-objective']) {
      const text = schoolCoachMissMessage({
        lesson: { exam: true },
        kind,
        square: 'a1',
        selected: 'f7',
        expected,
        repeatCount: 2,
      });
      expect(text).not.toContain('f7');
      expect(text).not.toContain('g7');
    }
  });

  it('acknowledges recovery after a real failed attempt', () => {
    expect(schoolCoachSelectionMessage({ square: 'e2', mistakes: 1, step: 1, totalMoves: 1 })).toContain('Ahora sí');
    expect(schoolCoachStepMessage({ mistakes: 1, nextStep: 2, totalMoves: 3 })).toContain('tropiezo anterior');
  });

  it('keeps the lesson hint factual', () => {
    expect(schoolCoachHintMessage({ hint: 'Mira e2 y e4.' })).toContain('Mira e2 y e4.');
  });
});
