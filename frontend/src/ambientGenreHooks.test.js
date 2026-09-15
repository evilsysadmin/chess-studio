import { describe, expect, it } from 'vitest';
import { AMBIENT_THEMES } from './ambientCatalog.js';
import { structuredFeel } from './ambientProfiles.js';
import { AMBIENT_GENRE_HOOK_IDS } from './ambientGenreHooks.js';

function contour(motif = {}) {
  const notes = Object.values(motif);
  return notes.slice(1).map((note, index) => note - notes[index]).join(',');
}

describe('curated Mediterranean and trip-hop hooks', () => {
  it('installs a sparse valid recurring phrase in every underwritten score', () => {
    expect(AMBIENT_GENRE_HOOK_IDS).toHaveLength(26);
    for (const id of AMBIENT_GENRE_HOOK_IDS) {
      const theme = AMBIENT_THEMES[id];
      const feel = structuredFeel(theme);
      const steps = Object.keys(feel.signature.motif).map(Number);

      expect(feel.layers.signature).toBe(true);
      expect(steps).toHaveLength(4);
      expect(feel.signature.everyCycles).toBeGreaterThanOrEqual(2);
      expect(Math.max(...steps)).toBeLessThan(theme.stepsPerSection);
      expect(feel.signature.sections.every((index) => index >= 0 && index < theme.sections.length)).toBe(true);
    }
  });

  it('uses instruments already present in the final scene', () => {
    for (const id of AMBIENT_GENRE_HOOK_IDS) {
      const theme = AMBIENT_THEMES[id];
      const feel = structuredFeel(theme);
      const palette = [feel.leadInstrument || theme.leadInstrument, feel.counterInstrument || theme.counterInstrument];
      if (id === 'casablanca') expect(feel.signature.instrument).toBe('mutedHorn');
      else expect(palette.filter(Boolean)).toContain(feel.signature.instrument);
    }
  });

  it('avoids stamping one stock contour across the collection', () => {
    const contours = AMBIENT_GENRE_HOOK_IDS.map((id) => contour(structuredFeel(AMBIENT_THEMES[id]).signature.motif));
    expect(new Set(contours).size).toBeGreaterThanOrEqual(21);
  });
});
