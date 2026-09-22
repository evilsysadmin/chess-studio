import { describe, expect, it } from 'vitest';
import { AMBIENT_THEMES, AMBIENT_THEME_OPTIONS } from './ambientCatalog.js';
import { structuredSectionInstrument } from './ambientInstrumentRouting.js';
import { structuredFeel } from './ambientProfiles.js';
import { PREMIUM_STRUCTURED_TIMBRE_IDS } from './ambientStructuredTimbre.js';

const PHYSICALLY_MODELLED = new Set([
  'guitar2',
  'nylonGuitar',
  'jazzGuitar',
  'overdriveGuitar',
  'powerGuitar',
  'tremoloGuitar',
]);

function resolvedThemeInstruments(theme, feel) {
  const instruments = new Set();
  for (const lane of ['lead', 'counter', 'chord', 'bass']) {
    const instrument = feel?.[`${lane}Instrument`] || theme?.[`${lane}Instrument`];
    if (instrument) instruments.add(instrument);
  }
  if (feel?.signature?.instrument) instruments.add(feel.signature.instrument);

  for (const section of theme?.sections || []) {
    for (const lane of ['lead', 'counter']) {
      const instrument = structuredSectionInstrument(theme, feel, section, lane);
      if (instrument) instruments.add(instrument);
    }
    for (const lane of ['chord', 'bass']) {
      const instrument = section?.[`${lane}Instrument`];
      if (instrument) instruments.add(instrument);
    }
  }
  return instruments;
}

describe('Radio Matthias · premium timbre coverage', () => {
  it('routes every published structured theme through premium-v2 production', () => {
    const uncovered = [];
    for (const option of AMBIENT_THEME_OPTIONS) {
      if (option.id === 'andalus') continue; // bespoke legacy ensemble, polished in sound.js
      const theme = AMBIENT_THEMES[option.id] || option;
      const feel = structuredFeel(theme);
      if (
        feel?.production?.grade !== 'premium-v2'
        || feel?.production?.timbre !== 'coherent-voice-v2'
        || !Number.isFinite(feel?.finish?.brightness)
        || !Number.isFinite(feel?.finish?.reflectionScale)
        || !Number.isFinite(feel?.finish?.stereoWidth)
      ) {
        uncovered.push(option.id);
      }
    }
    expect(uncovered, `Themes without premium-v2 production: ${uncovered.join(', ')}`).toEqual([]);
  });

  it('leaves no published structured oscillator voice on the generic timbre fallback', () => {
    const premium = new Set(PREMIUM_STRUCTURED_TIMBRE_IDS);
    const uncovered = new Map();

    for (const option of AMBIENT_THEME_OPTIONS) {
      if (option.id === 'andalus') continue;
      const theme = AMBIENT_THEMES[option.id] || option;
      const feel = structuredFeel(theme);
      for (const instrument of resolvedThemeInstruments(theme, feel)) {
        if (PHYSICALLY_MODELLED.has(instrument) || premium.has(instrument)) continue;
        const themes = uncovered.get(instrument) || [];
        themes.push(option.id);
        uncovered.set(instrument, themes);
      }
    }

    const details = [...uncovered.entries()]
      .map(([instrument, themes]) => `${instrument}: ${themes.join(', ')}`)
      .join('\n');
    expect([...uncovered.keys()], `Published voices using generic fallback:\n${details}`).toEqual([]);
  });

  it('gives regional plucks and exposed colour voices their own physical-ish finish', () => {
    const premium = new Set(PREMIUM_STRUCTURED_TIMBRE_IDS);
    expect(premium).toEqual(expect.objectContaining ? premium : premium);
    for (const instrument of ['oudJazz', 'qanun', 'buzuq', 'harpsichord', 'glass', 'vocalAir', 'tropicalPluck', 'tremolo']) {
      expect(premium.has(instrument), instrument).toBe(true);
    }
  });
});
