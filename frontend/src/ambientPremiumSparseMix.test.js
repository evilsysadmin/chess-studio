import { describe, expect, it } from 'vitest';
import { withAmbientPremiumProduction } from './ambientPremiumProduction.js';

describe('ambient premium sparse mix hierarchy', () => {
  it('leaves deliberately quiet chamber voices in the background', () => {
    const authored = { lead: 0.4, counter: 0.22, bass: 0.48, chord: 0.34 };
    const premium = withAmbientPremiumProduction(
      { id: 'quiet-chamber', genre: 'Clásica' },
      {
        family: 'quiet-chamber',
        mix: authored,
        percussion: { kit: 'none', punch: 0, period: 32, pattern: {} },
      },
    );

    expect(premium.mix).toEqual(authored);
  });

  it('still polishes normal atmospheric balances and rhythmic mixes', () => {
    const chamber = withAmbientPremiumProduction(
      { id: 'full-chamber', genre: 'Clásica' },
      {
        mix: { lead: 0.62, counter: 0.4, bass: 0.7, chord: 0.5 },
        percussion: { kit: 'none', punch: 0, period: 32, pattern: {} },
      },
    );
    const drive = withAmbientPremiumProduction(
      { id: 'drive', genre: 'Energía' },
      {
        mix: { lead: 0.4, counter: 0.24, bass: 0.6, chord: 0.3 },
        percussion: { kit: 'electronic', punch: 1.0, period: 16, pattern: { 0: 'K' } },
      },
    );

    expect(chamber.mix.lead).not.toBe(0.62);
    expect(chamber.mix.counter).not.toBe(0.4);
    expect(drive.mix.lead).toBeGreaterThan(0.4);
    expect(drive.mix.counter).toBeGreaterThan(0.24);
  });
});
