import { describe, expect, it } from 'vitest';
import { AMBIENT_THEMES } from './ambientCatalog.js';
import { structuredFeel } from './ambientProfiles.js';

const TROPICAL_HOUSE_IDS = Object.freeze(['palmsAtDusk', 'islandKnight', 'bishopSunset']);
const EXPECTED_GROOVE = Object.freeze({
  0:'K', 2:'H', 4:'K', 6:'H', 8:'K', 10:'H', 12:'K', 14:'H',
});

describe('Tropical House · dance drive', () => {
  it('keeps every published Tropical House theme on a real four-on-the-floor groove', () => {
    for (const id of TROPICAL_HOUSE_IDS) {
      const theme = AMBIENT_THEMES[id];
      const feel = structuredFeel(theme);

      expect(theme?.genre).toBe('Tropical House');
      expect(feel?.percussion?.kit).toBe('tropical-house-sidechain');
      expect(feel?.percussion?.period).toBe(16);
      expect(feel?.percussion?.pattern).toEqual(EXPECTED_GROOVE);
      expect(feel?.percussion?.punch).toBeGreaterThanOrEqual(1.18);
    }
  });

  it('uses short house stabs and an active bass instead of the old resort-bed arrangement', () => {
    for (const id of TROPICAL_HOUSE_IDS) {
      const feel = structuredFeel(AMBIENT_THEMES[id]);

      expect(feel?.chordHoldSteps).toBeLessThanOrEqual(6);
      expect(feel?.bassHoldSteps).toBeLessThanOrEqual(2);
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
    }
  });
});
