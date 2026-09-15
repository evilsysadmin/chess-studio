import { describe, expect, it } from 'vitest';
import { AMBIENT_THEMES } from './ambientCatalog.js';
import { structuredFeel } from './ambientProfiles.js';
import { LOFI_SONGBOOK_IDS, LOFI_SONGBOOK_REWRITES } from './ambientLofiSongbook.js';

const IDS = ['lofiRainTape', 'lofiWindowLight', 'lofiPawnNotebook'];

function rhythmFingerprint(line = {}) {
  const steps = Object.keys(line).map(Number);
  return steps.slice(1).map((step, index) => step - steps[index]).join(',');
}

describe('Lo-Fi songbook', () => {
  it('gives all three scores a real lead, reply and bass pocket', () => {
    expect(LOFI_SONGBOOK_IDS).toEqual(IDS);
    for (const id of IDS) {
      const rewrite = LOFI_SONGBOOK_REWRITES[id];
      expect(rewrite.melodySections).toHaveLength(2);
      for (const section of rewrite.melodySections) {
        expect(Object.keys(section.lead).length).toBeGreaterThanOrEqual(12);
        expect(new Set(Object.values(section.lead)).size).toBeGreaterThanOrEqual(6);
        expect(Object.keys(section.counter).length).toBeGreaterThanOrEqual(6);
        expect(Object.keys(section.bass).length).toBeGreaterThanOrEqual(12);
      }
    }
  });

  it('keeps three distinct rhythmic hooks instead of the same eight-step ladder', () => {
    const fingerprints = IDS.map((id) => rhythmFingerprint(AMBIENT_THEMES[id].sections[0].lead));
    expect(new Set(fingerprints).size).toBe(IDS.length);
    expect(fingerprints.every((fingerprint) => !/^8(?:,8)+$/.test(fingerprint))).toBe(true);
  });

  it('puts every Lo-Fi production in an audible drum pocket', () => {
    for (const id of IDS) {
      const theme = AMBIENT_THEMES[id];
      const feel = structuredFeel(theme);
      const strongHits = Object.values(feel.percussion.pattern).filter((voice) => voice === 'K' || voice === 'S');
      expect(60000 / (theme.stepMs * 4)).toBeGreaterThanOrEqual(89);
      expect(60000 / (theme.stepMs * 4)).toBeLessThanOrEqual(97);
      expect(strongHits.length).toBeGreaterThanOrEqual(2);
      expect(Object.keys(feel.percussion.pattern).length).toBeGreaterThanOrEqual(6);
      expect(feel.mix.lead).toBeGreaterThanOrEqual(0.60);
      expect(feel.mix.bass).toBeGreaterThanOrEqual(0.88);
    }
  });
});
