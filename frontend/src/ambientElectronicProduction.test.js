import { describe, expect, it } from 'vitest';
import { AMBIENT_THEMES } from './ambientCatalog.js';
import { structuredFeel } from './ambientProfiles.js';
import { ELECTRONIC_PRODUCTION_IDS } from './ambientElectronicProduction.js';
import { getPercussionVoiceKit } from './sound.js';

describe('electronic production identities', () => {
  it('gives the five synth-driven scores dedicated machines and beat grids', () => {
    const feels = ELECTRONIC_PRODUCTION_IDS.map((id) => structuredFeel(AMBIENT_THEMES[id]));
    expect(new Set(feels.map((feel) => feel.family)).size).toBe(ELECTRONIC_PRODUCTION_IDS.length);
    expect(new Set(feels.map((feel) => feel.percussion.kit)).size).toBe(ELECTRONIC_PRODUCTION_IDS.length);
    ELECTRONIC_PRODUCTION_IDS.forEach((id, index) => expect(getPercussionVoiceKit(id)).toBe(feels[index].percussion.kit));
  });

  it('uses purpose-built synth voices instead of one generic saw preset', () => {
    const desert = structuredFeel(AMBIENT_THEMES.electricDesert);
    const storm = structuredFeel(AMBIENT_THEMES.storm);
    const bunker = structuredFeel(AMBIENT_THEMES.analogBunker);
    const freight = structuredFeel(AMBIENT_THEMES.nightFreight);

    expect(desert.leadInstrument).toBe('analogLead');
    expect(desert.chordInstrument).toBe('widePad');
    expect(storm.leadInstrument).toBe('stormPluck');
    expect(storm.chordInstrument).toBe('stormPad');
    expect(bunker.leadInstrument).toBe('subPulse');
    expect(freight.leadInstrument).toBe('metallic');
  });

  it('gives every rewritten score a real recurring signature', () => {
    for (const id of ['electricDesert','storm','analogBunker','nightFreight']) {
      const feel = structuredFeel(AMBIENT_THEMES[id]);
      expect(feel.layers.signature).toBe(true);
      expect(Object.keys(feel.signature.motif)).toHaveLength(4);
      expect(feel.signature.everyCycles).toBeGreaterThanOrEqual(2);
    }
  });

  it('leaves Clockwork acoustic-mechanical instead of forcing synths everywhere', () => {
    const feel = structuredFeel(AMBIENT_THEMES.clockwork);
    expect(feel.leadInstrument || AMBIENT_THEMES.clockwork.leadInstrument).toBe('harpsichord');
    expect(feel.signature.instrument).toBe('metallic');
  });
});
