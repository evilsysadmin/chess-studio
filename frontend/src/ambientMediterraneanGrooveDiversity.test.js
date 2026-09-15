import { describe, expect, it } from 'vitest';
import { AMBIENT_THEME_OPTIONS, AMBIENT_THEMES } from './ambientCatalog.js';
import { structuredFeel } from './ambientProfiles.js';
import { MEDITERRANEAN_GROOVE_IDS, MEDITERRANEAN_GROOVE_REWRITES } from './ambientMediterraneanGrooveDiversity.js';

function fingerprint(percussion) {
  const events = Object.entries(percussion?.pattern || {})
    .sort(([left], [right]) => Number(left) - Number(right));
  return `${percussion?.period}|${JSON.stringify(events)}`;
}

describe('Jazz mediterráneo · diversidad de groove', () => {
  it('replaces every formerly duplicated grid with an authored pattern', () => {
    expect(MEDITERRANEAN_GROOVE_IDS).toHaveLength(22);
    for (const id of MEDITERRANEAN_GROOVE_IDS) {
      const feel = structuredFeel(AMBIENT_THEMES[id]);
      const rewrite = MEDITERRANEAN_GROOVE_REWRITES[id];
      expect(feel.percussion.period).toBe(rewrite.period);
      expect(feel.percussion.pattern).toEqual(rewrite.pattern);
      expect(Object.keys(feel.percussion.pattern).every((step) => Number(step) < feel.percussion.period)).toBe(true);
    }
  });

  it('hands Malaga last tram groove ownership to its final authored arrangement', () => {
    expect(MEDITERRANEAN_GROOVE_REWRITES.malagaLastTram).toBeUndefined();
    const feel = structuredFeel(AMBIENT_THEMES.malagaLastTram);
    expect(feel.percussion.period).toBe(32);
    expect(feel.percussion.kit).toBe('rooftop-jazz');
  });

  it('leaves no exact percussion-grid duplicate in the published Mediterranean dial', () => {
    const fingerprints = AMBIENT_THEME_OPTIONS
      .filter((option) => option.genre === 'Jazz / Mediterráneo')
      .map((option) => structuredFeel(AMBIENT_THEMES[option.id]))
      .filter((feel) => feel && feel.percussion?.kit !== 'none')
      .map((feel) => fingerprint(feel.percussion));
    expect(new Set(fingerprints).size).toBe(fingerprints.length);
  });

  it('matches event density to tempo instead of forcing one loop everywhere', () => {
    for (const id of MEDITERRANEAN_GROOVE_IDS) {
      const theme = AMBIENT_THEMES[id];
      const feel = structuredFeel(theme);
      const bpm = 60000 / (theme.stepMs * 4);
      const hits = Object.keys(feel.percussion.pattern).length;
      if (bpm >= 125) expect(hits).toBeGreaterThanOrEqual(6);
      if (bpm <= 85) expect(hits).toBeLessThanOrEqual(5);
    }
  });

  it('locks Beirut night taxi to the same 18-step phrase as its written score', () => {
    const theme = AMBIENT_THEMES.beirutNightTaxi;
    const feel = structuredFeel(theme);

    expect(theme.stepsPerSection).toBe(72);
    expect(feel.percussion.period).toBe(18);
    expect(theme.stepsPerSection % feel.percussion.period).toBe(0);
    expect(Object.keys(feel.percussion.pattern).map(Number)).toEqual([0, 3, 6, 9, 12, 15]);
  });

  it('keeps Andalusian coast hand percussion on the four-step melody lattice', () => {
    const theme = AMBIENT_THEMES.andalusianCoast;
    const feel = structuredFeel(theme);
    const hits = Object.keys(feel.percussion.pattern).map(Number);

    expect(theme.stepsPerSection).toBe(64);
    expect(feel.percussion.period).toBe(16);
    expect(theme.stepsPerSection % feel.percussion.period).toBe(0);
    expect(hits).toEqual([0, 4, 8, 12]);
    expect(hits.every((step) => step % 4 === 0)).toBe(true);
  });
});
