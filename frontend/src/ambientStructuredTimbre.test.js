import { describe, expect, it } from 'vitest';
import {
  PREMIUM_STRUCTURED_TIMBRE_IDS,
  structuredPartialDetune,
  structuredVoiceTimbre,
} from './ambientStructuredTimbre.js';

describe('premium structured timbre', () => {
  it('gives exposed acoustic voices explicit body/edge treatment', () => {
    expect(PREMIUM_STRUCTURED_TIMBRE_IDS).toEqual(expect.arrayContaining([
      'feltGrand', 'rhodesWarm', 'organ', 'organbass', 'choir', 'clarinet', 'mutedHorn', 'uprightBass',
    ]));
    expect(structuredVoiceTimbre('organ')).toEqual(expect.objectContaining({
      bodyHz: 520,
      bodyGainDb: 2.3,
      edgeGainDb: -3.4,
      coherentPartials: true,
    }));
    expect(structuredVoiceTimbre('rhodesWarm').bodyGainDb).toBeGreaterThan(1.5);
  });

  it('keeps acoustic partials phase-coherent instead of spreading every harmonic by several cents', () => {
    const organ = [0, 1, 2, 3].map((index) => structuredPartialDetune('organ', 60, index, 0.4));
    expect(Math.max(...organ) - Math.min(...organ)).toBeLessThan(0.2);
    expect(Math.max(...organ.map(Math.abs))).toBeLessThan(0.25);
  });

  it('retains controlled stereo-width detune for intentionally synthetic families', () => {
    const pad = [0, 1, 2, 3].map((index) => structuredPartialDetune('widePad', 60, index, 0.8));
    expect(Math.max(...pad) - Math.min(...pad)).toBeGreaterThan(1.0);
    expect(Math.max(...pad.map(Math.abs))).toBeLessThan(2.0);
  });

  it('falls back to conservative coherent tuning for unknown voices', () => {
    const fallback = structuredVoiceTimbre('futureInstrument');
    expect(fallback.coherentPartials).toBe(true);
    expect(Math.abs(structuredPartialDetune('futureInstrument', 61, 4, 0.5))).toBeLessThan(0.4);
  });
});
