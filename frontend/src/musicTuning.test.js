import { describe, expect, it } from 'vitest';
import {
  CHESS_STUDIO_CONCERT_PITCH_HZ,
  CHESS_STUDIO_TUNING_CENTS,
  CHESS_STUDIO_TUNING_RATIO,
  midiToChessStudioFrequency,
  orchestralPlaybackRateForSemitones,
  tuneStandardFrequency,
} from './musicTuning.js';

describe('Chess Studio concert pitch', () => {
  it('tunes A4 and legacy 440 Hz material to 432 Hz', () => {
    expect(CHESS_STUDIO_CONCERT_PITCH_HZ).toBe(432);
    expect(midiToChessStudioFrequency(69)).toBe(432);
    expect(tuneStandardFrequency(440)).toBe(432);
    expect(CHESS_STUDIO_TUNING_CENTS).toBeCloseTo(-31.7667, 3);
  });

  it('preserves equal-tempered intervals around the new reference', () => {
    expect(midiToChessStudioFrequency(81)).toBe(864);
    expect(midiToChessStudioFrequency(57)).toBe(216);
    expect(midiToChessStudioFrequency(60) / midiToChessStudioFrequency(59)).toBeCloseTo(2 ** (1 / 12), 8);
  });

  it('applies the same pitch ratio to recorded orchestral samples', () => {
    expect(orchestralPlaybackRateForSemitones(0)).toBe(CHESS_STUDIO_TUNING_RATIO);
    expect(orchestralPlaybackRateForSemitones(-1)).toBeCloseTo(CHESS_STUDIO_TUNING_RATIO * (2 ** (-1 / 12)), 8);
  });
});
