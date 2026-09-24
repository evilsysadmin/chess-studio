import { describe, expect, it } from 'vitest';
import { buildSchoolExplanationDemo, schoolExplanationFrameLabel } from './SchoolExplanationDemo.js';

describe('Class Room explanation demo', () => {
  it('builds a non-destructive frame for every validated lesson move', () => {
    const demo = buildSchoolExplanationDemo({
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      line: [
        { from: 'e2', to: 'e4', auto: false },
        { from: 'e7', to: 'e5', auto: true },
        { from: 'g1', to: 'f3', auto: false },
      ],
    });
    expect(demo.ok).toBe(true);
    expect(demo.frames).toHaveLength(4);
    expect(demo.frames[1].animate).toEqual({ from: 'e2', to: 'e4', capture: false });
    expect(schoolExplanationFrameLabel(demo.frames[2])).toBe('Respuesta rival');
  });

  it('keeps capture semantics for native board animation', () => {
    const demo = buildSchoolExplanationDemo({
      fen: '7k/8/8/8/8/5n2/4P3/K7 w - - 0 1',
      line: [{ from: 'e2', to: 'f3', auto: false }],
    });
    expect(demo.frames[1].animate.capture).toBe(true);
  });

  it('fails closed when a curated explanation line becomes illegal', () => {
    const demo = buildSchoolExplanationDemo({
      fen: '7k/8/8/8/8/8/4P3/K7 w - - 0 1',
      line: [{ from: 'e2', to: 'e5', auto: false }],
    });
    expect(demo).toMatchObject({ ok: false, reason: 'illegal-demo-line', brokenIndex: 0 });
  });
});
