import { describe, expect, it } from 'vitest';
import { createChroniclesState } from './chroniclesOfMatthias.js';
import { chroniclesPartyRelic } from './chroniclesOfMatthiasRelics.js';

describe('Chronicles carried relic continuity', () => {
  it('shows no carried relic before the side encounter is actually won', () => {
    const state = createChroniclesState();
    expect(chroniclesPartyRelic(state, 'bishop')).toBeNull();
  });

  it('attaches the recovered spectral lantern only to Aziz', () => {
    const state = { ...createChroniclesState(), spectralLantern: true };
    expect(chroniclesPartyRelic(state, 'bishop')).toBe('spectral-lantern');
    expect(chroniclesPartyRelic(state, 'matthias')).toBeNull();
    expect(chroniclesPartyRelic(state, 'rook')).toBeNull();
    expect(chroniclesPartyRelic(state, 'knight')).toBeNull();
  });
});
