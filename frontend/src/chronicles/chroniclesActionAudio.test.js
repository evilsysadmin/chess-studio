import { describe, expect, it } from 'vitest';
import { chroniclesActionAudioCue } from './chroniclesActionAudio.js';
import { createChroniclesState, chroniclesReduce } from '../chroniclesOfMatthias.js';

describe('Chronicles action audio cues', () => {
  it('distinguishes movement, turning and blocked movement from real state transitions', () => {
    const start = createChroniclesState();
    const moved = chroniclesReduce(start, 'forward');
    expect(chroniclesActionAudioCue(start, moved, 'forward')).toBe('step');

    const turned = chroniclesReduce(start, 'turn-left');
    expect(chroniclesActionAudioCue(start, turned, 'turn-left')).toBe('turn');

    const wallState = { ...start, x: 1, y: 1, direction: 0 };
    const blocked = chroniclesReduce(wallState, 'forward');
    expect(chroniclesActionAudioCue(wallState, blocked, 'forward')).toBe('blocked');
  });

  it('distinguishes misses, hits, retaliation and defeats from actual HP changes', () => {
    const start = createChroniclesState();
    const miss = chroniclesReduce(start, { type: 'attack', memberId: 'matthias' });
    expect(chroniclesActionAudioCue(start, miss, { type: 'attack', memberId: 'matthias' })).toBe('miss');

    const rangedHit = chroniclesReduce(start, { type: 'attack', memberId: 'bishop' });
    expect(chroniclesActionAudioCue(start, rangedHit, { type: 'attack', memberId: 'bishop' })).toBe('hit');

    const close = chroniclesReduce(start, 'forward');
    const retaliation = chroniclesReduce(close, { type: 'attack', memberId: 'rook' });
    expect(chroniclesActionAudioCue(close, retaliation, { type: 'attack', memberId: 'rook' })).toBe('retaliation');

    const almostDead = { ...close, enemyHp: 1 };
    const defeated = chroniclesReduce(almostDead, { type: 'attack', memberId: 'matthias' });
    expect(chroniclesActionAudioCue(almostDead, defeated, { type: 'attack', memberId: 'matthias' })).toBe('defeat');
  });
});
