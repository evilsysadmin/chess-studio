import { describe, expect, it } from 'vitest';
import { buildSchoolMovePlayback, schoolPlaybackDelay } from './SchoolMovePlayback.js';

describe('Class Room move playback', () => {
  it('builds an animated human frame plus validated automatic reply frames', () => {
    const line = [
      { from: 'e2', to: 'e4', auto: false },
      { from: 'e7', to: 'e5', auto: true },
      { from: 'g1', to: 'f3', auto: false },
    ];
    const result = buildSchoolMovePlayback({
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      line,
      lineIndex: 0,
      from: 'e2',
      to: 'e4',
    });
    expect(result.ok).toBe(true);
    expect(result.cursor).toBe(2);
    expect(result.complete).toBe(false);
    expect(result.autoReplies).toBe(1);
    expect(result.frames.map((frame) => frame.animate)).toEqual([
      { from: 'e2', to: 'e4', capture: false },
      { from: 'e7', to: 'e5', capture: false },
    ]);
  });

  it('keeps capture semantics for the native 2D/3D animation channel', () => {
    const result = buildSchoolMovePlayback({
      fen: '7k/8/8/8/8/5n2/4P3/K7 w - - 0 1',
      line: [{ from: 'e2', to: 'f3', auto: false }],
      from: 'e2',
      to: 'f3',
    });
    expect(result.ok).toBe(true);
    expect(result.frames[0].animate).toEqual({ from: 'e2', to: 'f3', capture: true });
  });

  it('refuses an unexpected or broken lesson line instead of animating garbage', () => {
    expect(buildSchoolMovePlayback({
      fen: '7k/8/8/8/8/8/4P3/K7 w - - 0 1',
      line: [{ from: 'e2', to: 'e4', auto: false }],
      from: 'e2',
      to: 'e3',
    })).toMatchObject({ ok: false, reason: 'unexpected-move' });
  });

  it('removes playback delay under reduced motion', () => {
    expect(schoolPlaybackDelay({ reducedMotion: true })).toBe(0);
    expect(schoolPlaybackDelay({ auto: false })).toBe(250);
    expect(schoolPlaybackDelay({ auto: true })).toBe(300);
  });
});
