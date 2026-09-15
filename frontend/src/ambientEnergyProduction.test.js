import { describe, expect, it } from 'vitest';
import { AMBIENT_THEMES } from './ambientCatalog.js';
import { structuredFeel } from './ambientProfiles.js';
import { ENERGY_PRODUCTION_IDS } from './ambientEnergyProduction.js';
import { getAmbientThemeSoundProfile, getPercussionVoiceKit } from './sound.js';

describe('energy production identities', () => {
  it('keeps all six tempos while giving each score a separate kit', () => {
    const feels = ENERGY_PRODUCTION_IDS.map((id) => structuredFeel(AMBIENT_THEMES[id]));
    expect(new Set(feels.map((feel) => feel.percussion.kit)).size).toBe(ENERGY_PRODUCTION_IDS.length);
    ENERGY_PRODUCTION_IDS.forEach((id, index) => expect(getPercussionVoiceKit(id)).toBe(feels[index].percussion.kit));
    expect(getAmbientThemeSoundProfile('neonSiege').estimatedBpm).toBeGreaterThanOrEqual(165);
    expect(getAmbientThemeSoundProfile('neonSiege').estimatedBpm).toBeLessThanOrEqual(175);
    expect(getAmbientThemeSoundProfile('overclockedKnight').estimatedBpm).toBeGreaterThanOrEqual(145);
  });

  it('separates synthwave, arcade, thrash and gallop palettes', () => {
    const neon = structuredFeel(AMBIENT_THEMES.neonKnight);
    const arcade = structuredFeel(AMBIENT_THEMES.midnightArcade);
    const siege = structuredFeel(AMBIENT_THEMES.neonSiege);
    const gallop = structuredFeel(AMBIENT_THEMES.overclockedKnight);

    expect(neon.leadInstrument).toBe('analogLead');
    expect(arcade.leadInstrument).toBe('arcadePulse');
    expect(siege.leadInstrument).toBe('overdriveGuitar');
    expect(siege.counterInstrument).toBe('anthemLead');
    expect(siege.chordInstrument).toBe('powerPad');
    expect(gallop.leadInstrument).toBe('anthemLead');
    expect(gallop.counterInstrument).toBe('overdriveGuitar');
  });

  it('makes every high-energy score hook-bearing without changing authored signatures', () => {
    for (const id of ENERGY_PRODUCTION_IDS) {
      const feel = structuredFeel(AMBIENT_THEMES[id]);
      expect(feel.layers.signature).toBe(true);
      expect(Object.keys(feel.signature.motif)).toHaveLength(4);
      expect(feel.signature.sections.every((index) => index < AMBIENT_THEMES[id].sections.length)).toBe(true);
    }
    expect(structuredFeel(AMBIENT_THEMES.reactorGambit).signature.instrument).toBe('neonBrass');
    expect(structuredFeel(AMBIENT_THEMES.checkEngine).signature.instrument).toBe('synth');
  });
});
