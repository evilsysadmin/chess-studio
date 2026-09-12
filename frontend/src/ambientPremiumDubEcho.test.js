import { describe, expect, it } from 'vitest';
import { withAmbientPremiumProduction } from './ambientPremiumProduction.js';

describe('ambient premium authored dub echo', () => {
  it('keeps Velvet Static long dub delay intact', () => {
    const premium = withAmbientPremiumProduction(
      { id: 'velvetStatic', genre: 'Trip-Hop / Downtempo' },
      {
        family: 'velvet-static-dub',
        delayMs: 310,
        space: 0.28,
        mix: { lead: 0.5, counter: 0.34, bass: 0.96, chord: 0.46 },
        percussion: { kit: 'dub', punch: 0.9, period: 16, pattern: { 0: 'K' } },
      },
    );

    expect(premium.delayMs).toBe(310);
  });

  it('still dries a generic trip-hop delay toward the genre target', () => {
    const premium = withAmbientPremiumProduction(
      { id: 'generic-trip-hop', genre: 'Trip-Hop / Downtempo' },
      {
        delayMs: 310,
        mix: {},
        percussion: { kit: 'trip-hop', punch: 0.9, period: 16, pattern: { 0: 'K' } },
      },
    );

    expect(premium.delayMs).toBeLessThan(310);
    expect(premium.delayMs).toBeGreaterThan(188);
  });
});
