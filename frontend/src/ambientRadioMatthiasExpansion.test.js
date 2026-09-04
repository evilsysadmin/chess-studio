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

const PUBLISHED_GENRES = AMBIENT_GENRE_ORDER.filter((genre) => genre !== 'Dark Ambient');
const PUBLISHED_EXPANSION_IDS = RADIO_MATTHIAS_THEME_IDS.filter(
  (id) => RADIO_MATTHIAS_GENRE_EXPANSION[id].genre !== 'Dark Ambient',
);

describe('Radio Matthias · expansión transversal', () => {
  it('añade exactamente un tema nuevo por cada género publicado', () => {
    expect(PUBLISHED_EXPANSION_IDS).toHaveLength(PUBLISHED_GENRES.length);
    const genres = PUBLISHED_EXPANSION_IDS.map((id) => RADIO_MATTHIAS_GENRE_EXPANSION[id].genre);
    expect(new Set(genres)).toEqual(new Set(PUBLISHED_GENRES));
    expect(genres).toHaveLength(new Set(genres).size);
  });

  it('los trece temas publicados están instalados en el dial y en su grupo correcto', () => {
    for (const id of PUBLISHED_EXPANSION_IDS) {
      const theme = RADIO_MATTHIAS_GENRE_EXPANSION[id];
      expect(AMBIENT_THEMES[id]).toBe(theme);
      expect(AMBIENT_THEME_OPTIONS.some((option) => option.id === id && option.genre === theme.genre)).toBe(true);
      expect(AMBIENT_THEME_GROUPS.find((group) => group.genre === theme.genre)?.themes.some((option) => option.id === id)).toBe(true);
    }
  });

  it('respeta que Dark Ambient siga retirado del catálogo curado', () => {
    expect(AMBIENT_THEME_OPTIONS.some((option) => option.genre === 'Dark Ambient')).toBe(false);
    expect(AMBIENT_THEME_GROUPS.some((group) => group.genre === 'Dark Ambient')).toBe(false);
    expect(AMBIENT_THEME_OPTIONS.some((option) => option.id === 'blackArchive')).toBe(false);
  });

  it('son composiciones largas y estructuradas, no aliases de temas anteriores', () => {
    const labels = new Set();
    const fingerprints = new Set();
    for (const id of PUBLISHED_EXPANSION_IDS) {
      const theme = RADIO_MATTHIAS_GENRE_EXPANSION[id];
      expect(theme.engine).toBe('structured');
      expect(theme.longFormMs).toBeGreaterThanOrEqual(350000);
      expect(theme.sections.length).toBeGreaterThanOrEqual(2);
      expect(theme.stepMs).toBeGreaterThan(60);
      expect(theme.leadInstrument).toBeTruthy();
      expect(labels.has(theme.label)).toBe(false);
      labels.add(theme.label);
      fingerprints.add(`${theme.genre}|${theme.stepMs}|${theme.leadInstrument}|${theme.counterInstrument || '-'}|${theme.chordInstrument}|${theme.bassInstrument}`);
    }
    expect(fingerprints.size).toBe(PUBLISHED_EXPANSION_IDS.length);
  });

  it('la instalación es idempotente y permite ocultar familias curadas', () => {
    const themes = {};
    const options = [];
    const groups = [];
    const args = {
      themes,
      options,
      groups,
      genreOrder: AMBIENT_GENRE_ORDER,
      hiddenIds: new Set(['blackArchive']),
    };
    installRadioMatthiasExpansion(args);
    installRadioMatthiasExpansion(args);
    expect(Object.keys(themes)).toHaveLength(RADIO_MATTHIAS_THEME_IDS.length);
    expect(options).toHaveLength(PUBLISHED_EXPANSION_IDS.length);
    expect(groups).toHaveLength(PUBLISHED_GENRES.length);
    expect(groups.every((group) => group.themes.length === 1)).toBe(true);
  });
});
