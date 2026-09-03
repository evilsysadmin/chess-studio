import { describe, expect, it } from 'vitest';
import './ambientProfiles.js';
import {
  AMBIENT_GENRE_ORDER,
  AMBIENT_THEMES,
  AMBIENT_THEME_GROUPS,
  AMBIENT_THEME_OPTIONS,
} from './ambientCatalog.js';
import {
  RADIO_MATTHIAS_GENRE_EXPANSION,
  RADIO_MATTHIAS_THEME_IDS,
  installRadioMatthiasExpansion,
} from './ambientRadioMatthiasExpansion.js';

describe('Radio Matthias · expansión transversal', () => {
  it('añade exactamente un tema nuevo por cada género visible', () => {
    expect(RADIO_MATTHIAS_THEME_IDS).toHaveLength(AMBIENT_GENRE_ORDER.length);
    const genres = RADIO_MATTHIAS_THEME_IDS.map((id) => RADIO_MATTHIAS_GENRE_EXPANSION[id].genre);
    expect(new Set(genres)).toEqual(new Set(AMBIENT_GENRE_ORDER));
    expect(genres).toHaveLength(new Set(genres).size);
  });

  it('los catorce temas están instalados en el dial y en su grupo correcto', () => {
    for (const id of RADIO_MATTHIAS_THEME_IDS) {
      const theme = RADIO_MATTHIAS_GENRE_EXPANSION[id];
      expect(AMBIENT_THEMES[id]).toBe(theme);
      expect(AMBIENT_THEME_OPTIONS.some((option) => option.id === id && option.genre === theme.genre)).toBe(true);
      expect(AMBIENT_THEME_GROUPS.find((group) => group.genre === theme.genre)?.themes.some((option) => option.id === id)).toBe(true);
    }
  });

  it('son composiciones largas y estructuradas, no aliases de temas anteriores', () => {
    const labels = new Set();
    const fingerprints = new Set();
    for (const theme of Object.values(RADIO_MATTHIAS_GENRE_EXPANSION)) {
      expect(theme.engine).toBe('structured');
      expect(theme.longFormMs).toBeGreaterThanOrEqual(350000);
      expect(theme.sections.length).toBeGreaterThanOrEqual(2);
      expect(theme.stepMs).toBeGreaterThan(60);
      expect(theme.leadInstrument).toBeTruthy();
      expect(labels.has(theme.label)).toBe(false);
      labels.add(theme.label);
      fingerprints.add(`${theme.genre}|${theme.stepMs}|${theme.leadInstrument}|${theme.counterInstrument || '-'}|${theme.chordInstrument}|${theme.bassInstrument}`);
    }
    expect(fingerprints.size).toBe(RADIO_MATTHIAS_THEME_IDS.length);
  });

  it('la instalación es idempotente y reconstruye grupos sin duplicar pistas', () => {
    const themes = {};
    const options = [];
    const groups = [];
    const args = { themes, options, groups, genreOrder: AMBIENT_GENRE_ORDER, hiddenIds: new Set() };
    installRadioMatthiasExpansion(args);
    installRadioMatthiasExpansion(args);
    expect(Object.keys(themes)).toHaveLength(RADIO_MATTHIAS_THEME_IDS.length);
    expect(options).toHaveLength(RADIO_MATTHIAS_THEME_IDS.length);
    expect(groups).toHaveLength(AMBIENT_GENRE_ORDER.length);
    expect(groups.every((group) => group.themes.length === 1)).toBe(true);
  });
});
