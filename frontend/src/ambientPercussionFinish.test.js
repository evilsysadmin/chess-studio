import { describe, expect, it } from 'vitest';
import { AMBIENT_PERCUSSION_FINISH, snareBodyFrequencies } from './ambientPercussionFinish.js';

describe('ambient percussion finish', () => {
  it('keeps the room short, dark and quiet enough to preserve transients', () => {
    const { room, compressor } = AMBIENT_PERCUSSION_FINISH;
    expect(room.delayMs).toBeGreaterThanOrEqual(10);
    expect(room.delayMs).toBeLessThanOrEqual(28);
    expect(room.gain).toBeGreaterThan(0);
    expect(room.gain).toBeLessThanOrEqual(0.06);
    expect(room.highpassHz).toBeGreaterThanOrEqual(140);
    expect(room.lowpassHz).toBeLessThanOrEqual(6000);
    expect(compressor.ratio).toBeLessThanOrEqual(2.5);
    expect(compressor.attack).toBeGreaterThanOrEqual(0.012);
  });

  it('adds only a subtle low snare body and follows authored tone', () => {
    const dark = snareBodyFrequencies(-1);
    const neutral = snareBodyFrequencies(0);
    const bright = snareBodyFrequencies(1);
    expect(AMBIENT_PERCUSSION_FINISH.snare.bodyGain).toBeLessThanOrEqual(0.25);
    expect(neutral.startHz).toBeGreaterThan(neutral.endHz);
    expect(bright.startHz).toBeGreaterThan(neutral.startHz);
    expect(dark.startHz).toBeLessThan(neutral.startHz);
    expect(neutral.endHz).toBeGreaterThanOrEqual(140);
    expect(neutral.startHz).toBeLessThanOrEqual(220);
  });
});
