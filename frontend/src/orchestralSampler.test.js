import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ORCHESTRAL_SAMPLE_LIBRARY,
  orchestralKindsForTheme,
  selectOrchestralSample,
} from './orchestralSampler.js';
import { CHESS_STUDIO_TUNING_RATIO } from './musicTuning.js';

describe('orchestral sampler', () => {
  it('keeps every recorded pitch within a restrained transposition range', () => {
    for (let note = 54; note <= 76; note += 1) {
      expect(Math.abs(selectOrchestralSample('strings', note).semitones)).toBeLessThanOrEqual(3);
    }
    for (let note = 43; note <= 61; note += 1) {
      expect(Math.abs(selectOrchestralSample('cello', note).semitones)).toBeLessThanOrEqual(2);
    }
  });

  it('ships the complete compact sample map under a two-megabyte budget', () => {
    const files = Object.values(ORCHESTRAL_SAMPLE_LIBRARY).flat().flatMap(({ file, files: variants }) => (
      variants || [file]
    )).map((file) => path.resolve(process.cwd(), 'public/audio/orchestra', file));
    files.forEach((file) => expect(fs.statSync(file).size).toBeGreaterThan(8_000));
    const bytes = files.reduce((total, file) => total + fs.statSync(file).size, 0);
    expect(bytes).toBeLessThan(2_200_000);
  });

  it('alternates short-bow recordings instead of machine-gunning one attack', () => {
    const first = selectOrchestralSample('spiccatoStrings', 66, 0);
    const second = selectOrchestralSample('spiccatoStrings', 66, 1);
    expect(first.root).toBe(67);
    expect(second.root).toBe(67);
    expect(first.file).not.toBe(second.file);
    expect(first.playbackRate).toBeCloseTo(CHESS_STUDIO_TUNING_RATIO * (2 ** (-1 / 12)), 5);
  });

  it('declines unsupported synthetic instruments cleanly', () => {
    expect(selectOrchestralSample('synth', 60)).toBeNull();
    expect(selectOrchestralSample('strings', Number.NaN)).toBeNull();
  });

  it('primes production overrides, section hand-offs and signature players', () => {
    expect(orchestralKindsForTheme({
      leadInstrument: 'strings',
      bassInstrument: 'synthbass',
      signature: { instrument: 'spiccatoStrings' },
      sections: [
        { counterInstrument: 'cello' },
        { bassInstrument: 'spiccatoCello' },
      ],
    })).toEqual(['strings', 'spiccatoStrings', 'cello', 'spiccatoCello']);
  });
});
