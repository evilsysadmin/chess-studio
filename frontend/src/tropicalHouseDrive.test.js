import { describe, expect, it } from 'vitest';
import { AMBIENT_THEMES } from './ambientCatalog.js';
import { structuredFeel } from './ambientProfiles.js';

const TROPICAL_HOUSE_IDS = Object.freeze(['palmsAtDusk', 'islandKnight', 'bishopSunset']);
describe('Tropical House · dance drive', () => {
  it('gives every published Tropical House theme its own groove and percussion production', () => {
    const kits = [];
    const grooves = [];
    for (const id of TROPICAL_HOUSE_IDS) {
      const theme = AMBIENT_THEMES[id];
      const feel = structuredFeel(theme);

      expect(theme?.genre).toBe('Tropical House');
      expect(feel?.percussion?.period).toBe(16);
      expect(feel?.percussion?.punch).toBeGreaterThanOrEqual(1.18);
      expect(feel?.percussion?.sidechainDepth).toBeGreaterThanOrEqual(0.5);
      expect(feel?.percussion?.sidechainReleaseMs).toBeGreaterThanOrEqual(100);
      const backbone = Object.entries(feel.percussion.pattern)
        .filter(([, hit]) => hit === 'K' || hit === 'A')
        .map(([step]) => Number(step));
      expect(backbone).toEqual([0, 4, 8, 12]);
      kits.push(feel.percussion.kit);
      grooves.push(JSON.stringify(feel.percussion.pattern));
    }
    expect(new Set(kits).size).toBe(TROPICAL_HOUSE_IDS.length);
    expect(new Set(grooves).size).toBe(TROPICAL_HOUSE_IDS.length);
  });

  it('uses short house stabs and an active bass instead of the old resort-bed arrangement', () => {
    for (const id of TROPICAL_HOUSE_IDS) {
      const feel = structuredFeel(AMBIENT_THEMES[id]);

      expect(feel?.chordHoldSteps).toBeLessThanOrEqual(3);
      expect(feel?.bassHoldSteps).toBeLessThanOrEqual(1.7);
      expect(feel?.mix?.bass).toBeGreaterThanOrEqual(1.08);
      expect(feel?.mix?.chord).toBeGreaterThanOrEqual(0.58);
      expect(feel?.space).toBeLessThanOrEqual(0.06);
    }
  });

  it('does not throw away the individual theme identity or the sparse signatures', () => {
    const families = TROPICAL_HOUSE_IDS.map((id) => structuredFeel(AMBIENT_THEMES[id])?.family);
    expect(new Set(families).size).toBe(TROPICAL_HOUSE_IDS.length);

    for (const id of TROPICAL_HOUSE_IDS) {
      const feel = structuredFeel(AMBIENT_THEMES[id]);
      expect(feel?.layers?.signature).toBe(true);
      expect(feel?.signature?.motif).toBeTruthy();
      expect(Object.keys(feel.signature.motif).length).toBeGreaterThanOrEqual(4);
    }
  });

  it('uses three distinct lead/counter palettes instead of one resort preset', () => {
    const palettes = TROPICAL_HOUSE_IDS.map((id) => {
      const feel = structuredFeel(AMBIENT_THEMES[id]);
      return `${feel.leadInstrument}/${feel.counterInstrument}/${feel.chordInstrument}`;
    });
    expect(new Set(palettes).size).toBe(TROPICAL_HOUSE_IDS.length);
    expect(structuredFeel(AMBIENT_THEMES.palmsAtDusk).leadInstrument).toBe('housePiano');
    expect(structuredFeel(AMBIENT_THEMES.islandKnight).leadInstrument).toBe('tropicalPluck');
    expect(structuredFeel(AMBIENT_THEMES.bishopSunset).leadInstrument).toBe('nylonGuitar');
  });
});
