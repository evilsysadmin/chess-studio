import { describe, expect, it } from 'vitest';
import { withAmbientPremiumProduction } from './ambientPremiumProduction.js';

describe('Pawn Marshal premium timbre', () => {
  it('contains the martial brass without changing the rest of the ensemble', () => {
    const premium = withAmbientPremiumProduction(
      {
        id: 'pawnMarshal',
        genre: 'Ecléctica',
        leadInstrument: 'brass',
        counterInstrument: 'felt',
        chordInstrument: 'rhodesWarm',
        bassInstrument: 'uprightBass',
      },
      {
        family: 'matthias-pawn-marshal',
        leadInstrument: 'brass',
        counterInstrument: 'felt',
        chordInstrument: 'rhodesWarm',
        bassInstrument: 'uprightBass',
        mix: { lead: 0.64, counter: 0.4, bass: 0.9, chord: 0.44 },
        percussion: { kit: 'march', punch: 0.9, period: 16, pattern: { 0: 'K', 8: 'S' } },
      },
    );

    expect(premium.leadInstrument).toBe('mutedHorn');
    expect(premium.counterInstrument).toBe('felt');
    expect(premium.chordInstrument).toBe('rhodesWarm');
    expect(premium.bassInstrument).toBe('uprightBass');
  });
});
