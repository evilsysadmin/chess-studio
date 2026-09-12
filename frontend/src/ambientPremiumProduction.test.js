import { describe, expect, it } from 'vitest';
import { AMBIENT_GENRE_ORDER } from './ambientCatalog.js';
import {
  GENRE_PRODUCTION,
  withAmbientPremiumProduction,
} from './ambientPremiumProduction.js';

describe('ambient premium production pass', () => {
  it('defines a finishing target for every published radio genre', () => {
    expect(Object.keys(GENRE_PRODUCTION)).toEqual(expect.arrayContaining(AMBIENT_GENRE_ORDER));
  });

  it('upgrades generic smooth-jazz instruments without erasing the written feel', () => {
    const theme = {
      id: 'test-smooth',
      genre: 'Smooth Jazz',
      leadInstrument: 'guitar2',
      counterInstrument: 'brass',
      chordInstrument: 'epiano',
      bassInstrument: 'bass',
    };
    const feel = {
      family: 'test-smooth-family',
      warmth: 1.04,
      releaseScale: 1.2,
      space: 0.04,
      delayMs: 90,
      mix: { lead: 0.8, counter: 0.52, bass: 1.08, chord: 0.34 },
      percussion: { kit: 'brushes', punch: 0.9, period: 16, pattern: { 0: 'K' } },
    };

    const premium = withAmbientPremiumProduction(theme, feel);

    expect(premium.family).toBe(feel.family);
    expect(premium.leadInstrument).toBe('jazzGuitar');
    expect(premium.counterInstrument).toBe('mutedHorn');
    expect(premium.chordInstrument).toBe('rhodesWarm');
    expect(premium.bassInstrument).toBe('uprightBass');
    expect(premium.space).toBeGreaterThan(feel.space);
    expect(premium.space).toBeLessThan(0.2);
    expect(premium.production).toEqual(expect.objectContaining({ grade: 'premium-v1', intent: 'warm-controlled' }));
    expect(Object.isFrozen(premium)).toBe(true);
    expect(Object.isFrozen(premium.mix)).toBe(true);
  });

  it('keeps deliberately silent percussion silent', () => {
    const percussion = Object.freeze({ kit: 'none', punch: 0, period: 32, pattern: Object.freeze({}) });
    const premium = withAmbientPremiumProduction(
      { id: 'quiet', genre: 'Piano / Minimal', leadInstrument: 'felt', chordInstrument: 'felt' },
      { family: 'quiet-room', percussion, mix: { lead: 0.5, counter: 0.3, bass: 0.4, chord: 0.4 } },
    );

    expect(premium.percussion).toBe(percussion);
    expect(premium.percussion.punch).toBe(0);
  });

  it('keeps energetic mixes tight instead of washing them in ambience', () => {
    const premium = withAmbientPremiumProduction(
      { id: 'drive', genre: 'Energía', leadInstrument: 'synth', bassInstrument: 'synthbass' },
      {
        family: 'drive-family',
        warmth: 0.8,
        releaseScale: 1.1,
        space: 0.16,
        delayMs: 180,
        mix: { lead: 0.6, counter: 0.4, bass: 0.9, chord: 0.4 },
        percussion: { kit: 'electronic', punch: 1.02, period: 16, pattern: { 0: 'K' } },
      },
    );

    expect(premium.space).toBeLessThan(0.16);
    expect(premium.delayMs).toBeLessThan(180);
    expect(premium.percussion.punch).toBeGreaterThan(1.02);
    expect(premium.production.intent).toBe('tight-forward');
  });
});
