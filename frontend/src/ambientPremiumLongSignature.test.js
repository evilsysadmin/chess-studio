import { describe, expect, it } from 'vitest';
import { withAmbientPremiumProduction } from './ambientPremiumProduction.js';

describe('ambient premium long signature phrasing', () => {
  it('keeps long muted-horn signatures at their authored duration', () => {
    const signature = Object.freeze({
      instrument: 'mutedHorn',
      sections: Object.freeze([0, 1]),
      everyCycles: 2,
      repeatPeriod: 64,
      durationSteps: 7.2,
      volume: 0.18,
      motif: Object.freeze({ 14: 65, 46: 62 }),
    });

    const premium = withAmbientPremiumProduction(
      { id: 'long-horn', genre: 'Trip-Hop / Downtempo' },
      { signature, mix: {}, percussion: { kit: 'brush-jazz', punch: 0.82 } },
    );

    expect(premium.signature.durationSteps).toBe(7.2);
    expect(premium.signature.volume).toBe(0.18);
    expect(premium.signature.instrument).toBe('mutedHorn');
    expect(premium.signature.motif).toBe(signature.motif);
    expect(premium.signature.repeatPeriod).toBe(64);
  });

  it('keeps eight-step piano signatures intact while short phrases still receive articulation', () => {
    const long = withAmbientPremiumProduction(
      { id: 'long-piano', genre: 'Piano / Minimal' },
      {
        signature: {
          instrument: 'felt', sections: [0, 1, 2], everyCycles: 2, repeatPeriod: 80,
          durationSteps: 8, volume: 0.14, motif: { 16: 64, 56: 62 },
        },
        mix: {}, percussion: { kit: 'none', punch: 0 },
      },
    );
    const short = withAmbientPremiumProduction(
      { id: 'short-piano', genre: 'Piano / Minimal' },
      {
        signature: {
          instrument: 'felt', sections: [0], everyCycles: 2, repeatPeriod: 64,
          durationSteps: 2.8, volume: 0.3, motif: { 8: 64 },
        },
        mix: {}, percussion: { kit: 'none', punch: 0 },
      },
    );

    expect(long.signature.durationSteps).toBe(8);
    expect(long.signature.volume).toBe(0.14);
    expect(short.signature.durationSteps).toBeGreaterThan(2.8);
    expect(short.signature.durationSteps).toBeLessThanOrEqual(5.2);
  });
});
