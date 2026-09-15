import { describe, expect, it } from 'vitest';
import { AMBIENT_THEME_OPTIONS, AMBIENT_THEMES, CURATED_HIDDEN_THEME_IDS } from './ambientCatalog.js';
import { structuredFeel } from './ambientProfiles.js';
import { FINAL_CATALOG_POLISH_IDS } from './ambientCatalogFinalPolish.js';
import { getPercussionVoiceKit } from './sound.js';

function productionChain(id) {
  const feel = structuredFeel(AMBIENT_THEMES[id]);
  return [feel.leadInstrument, feel.counterInstrument, feel.chordInstrument, feel.bassInstrument, feel.percussion?.kit, feel.percussion?.period].join('/');
}

describe('complete music catalog audit', () => {
  it('closes every short or missing signature, including hidden scores', () => {
    expect(FINAL_CATALOG_POLISH_IDS).toHaveLength(17);
    const structured = Object.values(AMBIENT_THEMES).filter((theme) => theme.engine === 'structured');
    expect(structured).toHaveLength(102);
    for (const theme of structured) {
      const feel = structuredFeel(theme);
      expect(Object.keys(feel.signature?.motif || {}).length, theme.id).toBeGreaterThanOrEqual(3);
      expect(feel.signature.sections.every((section) => section < theme.sections.length), theme.id).toBe(true);
    }
  });

  it('has no duplicated player chain inside a published genre', () => {
    for (const genre of new Set(AMBIENT_THEME_OPTIONS.map((theme) => theme.genre))) {
      const ids = AMBIENT_THEME_OPTIONS.filter((theme) => theme.genre === genre && theme.id !== 'andalus').map((theme) => theme.id);
      expect(new Set(ids.map(productionChain)).size, genre).toBe(ids.length);
    }
  });

  it('separates the three final Mediterranean collisions', () => {
    expect(productionChain('istanbulBackgammon')).not.toBe(productionChain('istanbul0326'));
    expect(productionChain('beirutHarbor2340')).not.toBe(productionChain('beirutNightTaxi'));
    expect(productionChain('cadizLanterns')).not.toBe(productionChain('andalusianCoast'));
    expect(getPercussionVoiceKit('istanbulBackgammon')).toBe('tavla-table');
    expect(getPercussionVoiceKit('beirutHarbor2340')).toBe('harbor-brush');
    expect(getPercussionVoiceKit('cadizLanterns')).toBe('cadiz-lantern-hand');
  });

  it('keeps every curated or internal hidden score production-ready', () => {
    const hidden = [...CURATED_HIDDEN_THEME_IDS, 'blackArchive'];
    expect(hidden).toHaveLength(7);
    for (const id of hidden) {
      const feel = structuredFeel(AMBIENT_THEMES[id]);
      expect(feel.finish?.name, id).toBeTruthy();
      expect(feel.family, id).toBeTruthy();
      expect(Object.keys(feel.signature.motif), id).toHaveLength(4);
    }
  });
});
