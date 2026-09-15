import { describe, expect, it } from 'vitest';
import { AMBIENT_THEMES } from './ambientCatalog.js';
import { structuredFeel } from './ambientProfiles.js';
import {
  MEDITERRANEAN_CHORD_ARTICULATION_IDS,
  MEDITERRANEAN_CHORD_ATTACK_PLANS,
  remapChordAttacks,
} from './ambientMediterraneanChordArticulation.js';

function chordFingerprint(theme) {
  return theme.sections.map((section) => Object.keys(section.chords || {}).join(',')).join('|');
}

describe('Mediterráneo · respiración armónica', () => {
  it('preserves voicing order while moving only the authored attacks', () => {
    const source = {0:[48,55,60],16:[50,57,62],32:[45,52,57],48:[47,54,59]};
    const remapped = remapChordAttacks(source, [0,13,29,46]);
    expect(Object.keys(remapped).map(Number)).toEqual([0,13,29,46]);
    expect(Object.values(remapped)).toEqual(Object.values(source));
  });

  it('gives all eleven arrangements a distinct four-scene harmonic rhythm', () => {
    const fingerprints = MEDITERRANEAN_CHORD_ARTICULATION_IDS.map((id) => {
      const theme = AMBIENT_THEMES[id];
      expect(theme.sections.map((section) => Object.keys(section.chords || {}).map(Number)))
        .toEqual(MEDITERRANEAN_CHORD_ATTACK_PLANS[id]);
      return chordFingerprint(theme);
    });
    expect(new Set(fingerprints).size).toBe(fingerprints.length);
  });

  it('lets the recomposed Malaga breathe much slower than the bright Andalusian coast', () => {
    const nile = AMBIENT_THEMES.nileBalcony0152;
    const coast = AMBIENT_THEMES.andalusianCoast;
    const malaga = AMBIENT_THEMES.malagaLastTram;
    const nileBpm = 60000 / (nile.stepMs * 4);
    const coastBpm = 60000 / (coast.stepMs * 4);
    const malagaBpm = 60000 / (malaga.stepMs * 4);

    expect(nileBpm).toBeLessThan(80);
    expect(coastBpm).toBeGreaterThan(110);
    expect(malagaBpm).toBeLessThan(90);
    expect(malagaBpm).toBeLessThan(coastBpm * 0.8);
    expect(structuredFeel(malaga).chordHoldSteps).toBeGreaterThan(0);
    expect(MEDITERRANEAN_CHORD_ATTACK_PLANS.malagaLastTram[0][1]).toBeGreaterThan(
      MEDITERRANEAN_CHORD_ATTACK_PLANS.andalusianCoast[0][1],
    );
  });
});
