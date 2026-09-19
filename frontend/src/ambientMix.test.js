import { describe, expect, it } from 'vitest';
import { AMBIENT_MASTERING, AMBIENT_STEM_MIX, ambientStemMix, ambientStemName } from './ambientMix.js';

describe('ambient stem mix', () => {
  it('gives every authored lane a restrained, non-overlapping mix strip', () => {
    expect(Object.keys(AMBIENT_STEM_MIX)).toEqual(['signature', 'lead', 'counter', 'chords', 'bass']);
    Object.values(AMBIENT_STEM_MIX).forEach((strip) => {
      expect(strip.gain).toBeGreaterThanOrEqual(0.85);
      expect(strip.gain).toBeLessThanOrEqual(1.08);
      expect(strip.highpassHz).toBeLessThan(strip.lowpassHz);
    });
    expect(AMBIENT_STEM_MIX.bass.lowpassHz).toBeLessThan(AMBIENT_STEM_MIX.chords.lowpassHz);
    expect(AMBIENT_STEM_MIX.counter.gain).toBeLessThan(AMBIENT_STEM_MIX.lead.gain);
  });

  it('falls back to the lead strip and keeps mastering gentle', () => {
    expect(ambientStemMix('unknown')).toBe(AMBIENT_STEM_MIX.lead);
    expect(ambientStemName('unknown')).toBe('lead');
    expect(ambientStemName('bass')).toBe('bass');
    expect(AMBIENT_MASTERING.glue.ratio).toBeLessThan(3);
    expect(AMBIENT_MASTERING.glue.attack).toBeGreaterThan(0.015);
    expect(AMBIENT_MASTERING.limiter.ratio).toBeGreaterThanOrEqual(10);
  });
});
