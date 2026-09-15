import { describe, expect, it } from 'vitest';
import { AMBIENT_THEME_OPTIONS, AMBIENT_THEMES, CURATED_HIDDEN_THEME_IDS } from './ambientCatalog.js';
import { structuredFeel } from './ambientProfiles.js';
import {
  FINAL_CATALOG_POLISH_IDS,
  MEDITERRANEAN_ORGANIC_POLISH_IDS,
  withFinalCatalogPolish,
} from './ambientCatalogFinalPolish.js';
import { RETIRED_MEDITERRANEAN_THEME_IDS } from './ambientMediterraneanGrooveDiversity.js';
import { getPercussionVoiceKit } from './sound.js';

function productionChain(id) {
  const feel = structuredFeel(AMBIENT_THEMES[id]);
  return [feel.leadInstrument, feel.counterInstrument, feel.chordInstrument, feel.bassInstrument, feel.percussion?.kit, feel.percussion?.period].join('/');
}

describe('complete music catalog audit', () => {
  it('closes every short or missing signature, including hidden scores', () => {
    expect(FINAL_CATALOG_POLISH_IDS).toHaveLength(18);
    const structured = Object.values(AMBIENT_THEMES).filter((theme) => theme.engine === 'structured');
    // Guard against accidental catalog loss without making legitimate additions
    // update an unrelated magic number every time the songbook grows.
    expect(structured.length).toBeGreaterThanOrEqual(106);
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

  it('anchors Tavla percussion to the same 3+3+3 pillars as its written bass', () => {
    const theme = AMBIENT_THEMES.istanbulBackgammon;
    const feel = structuredFeel(theme);

    expect(theme.stepsPerSection).toBe(72);
    expect(feel.percussion.period).toBe(18);
    expect(theme.stepsPerSection % feel.percussion.period).toBe(0);
    expect(feel.percussion.pattern).toEqual({ 0:'K', 4:'H', 6:'B', 10:'H', 12:'S', 16:'B' });
    expect(Object.values(feel.percussion.pattern)).not.toContain('W');
    for (const section of theme.sections) {
      expect(Object.keys(section.bass).map(Number).every((step) => step % 6 === 0)).toBe(true);
    }
  });

  it('gives Malaga last tram its own brushed-quartet silhouette', () => {
    const malaga = structuredFeel(AMBIENT_THEMES.malagaLastTram);
    const coast = structuredFeel(AMBIENT_THEMES.andalusianCoast);

    expect(malaga.family).toBe('malaga-last-tram-brushed-quartet');
    expect(malaga.leadInstrument).toBe('jazzGuitar');
    expect(malaga.counterInstrument).toBe('clarinet');
    expect(malaga.chordInstrument).toBe('rhodesWarm');
    expect(malaga.bassInstrument).toBe('uprightBass');
    expect(malaga.percussion.kit).toBe('rooftop-jazz');
    expect(malaga.percussion.period).toBe(32);
    expect(Object.keys(malaga.percussion.pattern).map(Number)).toEqual([0, 6, 12, 19, 24, 29]);
    expect(malaga.signature.instrument).toBe('jazzGuitar');
    expect(productionChain('malagaLastTram')).not.toBe(productionChain('andalusianCoast'));
    expect(malaga.percussion.pattern).not.toEqual(coast.percussion.pattern);
  });

  it('mixes the eastern-Mediterranean room like a small ensemble instead of a synthetic stack', () => {
    expect(MEDITERRANEAN_ORGANIC_POLISH_IDS).toHaveLength(18);
    expect(MEDITERRANEAN_ORGANIC_POLISH_IDS).toEqual(expect.arrayContaining([
      'beirut0113', 'beirutHarbor2340', 'istanbul0326', 'istanbulBackgammon',
      'cairo0047', 'cairoBlueNote0211', 'damascusBlueHour', 'ammanLateTable0303',
    ]));

    const seedFeel = Object.freeze({
      releaseScale:1.4,
      space:0.3,
      delayMs:320,
      layers:Object.freeze({ lead:true, counter:true, chords:true, bass:true, drums:true, signature:true }),
      mix:Object.freeze({ lead:0.8, counter:0.6, bass:0.8, chord:0.6 }),
      signature:Object.freeze({
        instrument:'qanun', motif:Object.freeze({ 4:64, 20:67, 36:65, 52:62 }),
        sections:Object.freeze([0]), repeatPeriod:64, durationSteps:4, volume:0.24, everyCycles:1,
      }),
    });

    for (const id of MEDITERRANEAN_ORGANIC_POLISH_IDS) {
      const result = withFinalCatalogPolish({ id, sections:[{}] }, seedFeel);
      expect(result.space, id).toBeLessThanOrEqual(0.105);
      expect(result.delayMs, id).toBeLessThanOrEqual(126);
      expect(result.mix.counter, id).toBeLessThanOrEqual(0.22);
      expect(result.mix.chord, id).toBeLessThanOrEqual(0.28);
      expect(result.finish?.organicWind, id).toBe(true);
      expect(result.signature.everyCycles, id).toBeGreaterThanOrEqual(3);
      expect(result.signature.volume, id).toBeLessThanOrEqual(0.12);
    }
  });

  it('keeps Cádiz on its authored 6/8 phrase instead of a drifting 16-step loop', () => {
    const theme = AMBIENT_THEMES.cadizLanterns;
    const feel = structuredFeel(theme);
    const pulse = Object.entries(feel.percussion.pattern)
      .filter(([, voice]) => voice === 'K' || voice === 'H' || voice === 'S')
      .map(([step]) => Number(step));

    expect(theme.stepsPerSection).toBe(72);
    expect(feel.percussion.period).toBe(18);
    expect(theme.stepsPerSection % feel.percussion.period).toBe(0);
    expect(pulse).toEqual([0, 6, 12]);
  });

  it('keeps every internal hidden score production-ready', () => {
    const retired = new Set(RETIRED_MEDITERRANEAN_THEME_IDS);
    const hidden = [...CURATED_HIDDEN_THEME_IDS].filter((id) => !retired.has(id));
    hidden.push('blackArchive');
    expect(hidden).toHaveLength(7);
    for (const id of hidden) {
      const feel = structuredFeel(AMBIENT_THEMES[id]);
      expect(feel.finish?.name, id).toBeTruthy();
      expect(feel.family, id).toBeTruthy();
      expect(Object.keys(feel.signature.motif), id).toHaveLength(4);
    }
  });
});
