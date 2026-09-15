import { describe, expect, it } from 'vitest';
import { AMBIENT_THEMES } from './ambientCatalog.js';
import './ambientProfiles.js';
import {
  BASS_ATTACK_PLANS,
  BASS_PHRASING_DIVERSITY_IDS,
  remapBassAttacks,
} from './ambientBassPhrasingDiversity.js';

function fingerprint(theme) {
  return theme.sections.map((section) => Object.keys(section.bass || {}).join(',')).join('|');
}

describe('Catálogo · fraseo de bajo', () => {
  it('moves attacks without rewriting the composed bass notes', () => {
    const source = {0:36,8:43,16:40,24:47};
    const remapped = remapBassAttacks(source, [0,7,17,26]);
    expect(Object.keys(remapped).map(Number)).toEqual([0,7,17,26]);
    expect(Object.values(remapped)).toEqual(Object.values(source));
  });

  it('replaces all duplicated families with 31 distinct temporal phrases', () => {
    const fingerprints = BASS_PHRASING_DIVERSITY_IDS.map((id) => {
      const theme = AMBIENT_THEMES[id];
      expect(theme.sections.map((section) => Object.keys(section.bass || {}).map(Number)))
        .toEqual(BASS_ATTACK_PLANS[id]);
      return fingerprint(theme);
    });
    expect(BASS_PHRASING_DIVERSITY_IDS).toHaveLength(31);
    expect(new Set(fingerprints).size).toBe(fingerprints.length);
  });

  it('keeps every authored attack ordered, anchored and inside its section', () => {
    for (const id of BASS_PHRASING_DIVERSITY_IDS) {
      const theme = AMBIENT_THEMES[id];
      for (const attacks of BASS_ATTACK_PLANS[id]) {
        expect(attacks[0]).toBe(0);
        expect(attacks).toEqual([...attacks].sort((left, right) => left - right));
        expect(attacks.at(-1)).toBeLessThan(theme.stepsPerSection);
      }
    }
  });
});
