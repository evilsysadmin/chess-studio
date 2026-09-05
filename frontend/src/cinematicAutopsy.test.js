import { describe, expect, it } from 'vitest';
import { buildCinematicAutopsyPlan, clampCinematicAutopsyCursor } from './cinematicAutopsy.js';

function moment(kind, index, loss = 0) {
  return {
    kind,
    label: kind,
    icon: '◆',
    detail: `${loss} cp`,
    move: {
      index,
      moveNumber: Math.floor(index / 2) + 1,
      played: `m${index}`,
      suggested: `s${index}`,
      loss,
      severity: loss >= 150 ? 'blunder' : loss >= 60 ? 'mistake' : 'ok',
    },
  };
}

describe('cinematic autopsy plan', () => {
  it('conserva como máximo tres capítulos distintos y calcula antes/impacto', () => {
    const plan = buildCinematicAutopsyPlan([
      moment('best', 1, 2),
      moment('turning', 5, 180),
      moment('duplicate', 5, 999),
      moment('worst', 8, 420),
      moment('extra', 10, 200),
    ]);

    expect(plan).toHaveLength(3);
    expect(plan.map((item) => item.moveIndex)).toEqual([1, 5, 8]);
    expect(plan[1]).toMatchObject({ focusStep: 5, impactStep: 6, loss: 180, severity: 'blunder' });
  });

  it('ignora momentos sin índice reconstruible', () => {
    expect(buildCinematicAutopsyPlan([{ kind: 'bad', move: { index: 'wat' } }, null])).toEqual([]);
  });

  it('acota la navegación al número de capítulos', () => {
    const plan = buildCinematicAutopsyPlan([moment('a', 1), moment('b', 2)]);
    expect(clampCinematicAutopsyCursor(plan, -4)).toBe(0);
    expect(clampCinematicAutopsyCursor(plan, 9)).toBe(1);
  });
});
