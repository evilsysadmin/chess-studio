import { describe, expect, it } from 'vitest';
import { AMBIENT_GENRE_ORDER, AMBIENT_THEME_GROUPS, AMBIENT_THEME_OPTIONS, AMBIENT_THEMES } from './ambientCatalog.js';
import { structuredFeel } from './ambientProfiles.js';
import { HOUSE_AFRO_GENRE, HOUSE_AFRO_PROFILES, HOUSE_AFRO_THEME_IDS, HOUSE_AFRO_THEMES } from './ambientHouseAfro.js';

function eventCount(line = {}) {
  return Object.keys(line).length;
}

describe('House / Afro · songbook premium', () => {
  it('publishes a complete radio family next to Tropical House', () => {
    expect(HOUSE_AFRO_THEME_IDS).toEqual(['midnightDevotion', 'terracottaPulse']);
    expect(AMBIENT_GENRE_ORDER.indexOf(HOUSE_AFRO_GENRE)).toBe(AMBIENT_GENRE_ORDER.indexOf('Tropical House') + 1);
    expect(AMBIENT_THEME_GROUPS.find((group) => group.genre === HOUSE_AFRO_GENRE)?.themes).toHaveLength(2);

    for (const id of HOUSE_AFRO_THEME_IDS) {
      expect(AMBIENT_THEMES[id]).toBe(HOUSE_AFRO_THEMES[id]);
      expect(AMBIENT_THEME_OPTIONS.some((option) => option.id === id && option.genre === HOUSE_AFRO_GENRE)).toBe(true);
    }
  });

  it('writes hooks, offbeat chords and rolling bass into every scene', () => {
    for (const theme of Object.values(HOUSE_AFRO_THEMES)) {
      expect(theme.sections).toHaveLength(3);
      expect(60000 / (theme.stepMs * 4)).toBeGreaterThanOrEqual(120);
      expect(60000 / (theme.stepMs * 4)).toBeLessThanOrEqual(123);
      for (const section of theme.sections) {
        expect(eventCount(section.lead)).toBeGreaterThanOrEqual(9);
        expect(eventCount(section.counter)).toBeGreaterThanOrEqual(5);
        expect(eventCount(section.chords)).toBeGreaterThanOrEqual(8);
        expect(Object.keys(section.chords).map(Number).every((step) => step % 4 === 2)).toBe(true);
        expect(eventCount(section.bass)).toBeGreaterThanOrEqual(16);
      }
    }
  });

  it('gives both tracks a real dance backbone without cloning their production chain', () => {
    const chains = [];
    const fingerprints = [];
    for (const id of HOUSE_AFRO_THEME_IDS) {
      const theme = AMBIENT_THEMES[id];
      const feel = structuredFeel(theme);
      const authored = HOUSE_AFRO_PROFILES[id];
      const backbone = Object.entries(feel.percussion.pattern)
        .filter(([, hit]) => hit === 'K' || hit === 'A')
        .map(([step]) => Number(step));

      expect(feel.family).toBe(authored.family);
      expect(backbone).toEqual([0, 4, 8, 12]);
      expect(feel.percussion.sidechainDepth).toBeGreaterThanOrEqual(0.6);
      expect(feel.chordHoldSteps).toBeLessThanOrEqual(2.7);
      expect(feel.bassHoldSteps).toBeLessThanOrEqual(1.5);
      expect(Object.keys(feel.signature.motif)).toHaveLength(4);
      chains.push([feel.leadInstrument, feel.counterInstrument, feel.chordInstrument, feel.percussion.kit].join('/'));
      fingerprints.push(JSON.stringify([theme.sections[0].lead, feel.harmonyPath, feel.percussion.pattern]));
    }
    expect(new Set(chains).size).toBe(HOUSE_AFRO_THEME_IDS.length);
    expect(new Set(fingerprints).size).toBe(HOUSE_AFRO_THEME_IDS.length);
  });
});
