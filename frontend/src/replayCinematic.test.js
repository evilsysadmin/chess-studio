import { describe, expect, it } from 'vitest';
import { replayCinematicCue, replayMatthiasKingColor, replayMoveAnimation } from './replayCinematic.js';

describe('replayCinematic', () => {
  it('animates only a forward movie step', () => {
    const move = { from: 'e2', to: 'e4', captured: null };
    expect(replayMoveAnimation(move, 4, 3, true)).toMatchObject({ from: 'e2', to: 'e4', seq: 'movie-4', capture: false });
    expect(replayMoveAnimation(move, 3, 4, true)).toBeNull();
    expect(replayMoveAnimation(move, 4, 3, false)).toBeNull();
  });

  it('preserves capture weight and puts Matthias on the CPU side', () => {
    expect(replayMoveAnimation({ from: 'd5', to: 'e4', captured: 'p' }, 9, 8, true)?.capture).toBe(true);
    expect(replayMatthiasKingColor('w')).toBe('b');
    expect(replayMatthiasKingColor('b')).toBe('w');
  });

  it('maps only post-game analysis severity to cinematic emphasis', () => {
    expect(replayCinematicCue({ severity: 'blunder' })).toBe('critical');
    expect(replayCinematicCue({ severity: 'mistake' })).toBe('dramatic');
    expect(replayCinematicCue({ severity: 'ok' })).toBe('normal');
  });
});
