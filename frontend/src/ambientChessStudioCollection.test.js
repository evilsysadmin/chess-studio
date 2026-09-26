import { describe, expect, it } from 'vitest';
import {
  AMBIENT_THEME_GROUPS,
  AMBIENT_THEME_OPTIONS,
  AMBIENT_THEMES,
  RETIRED_ECLECTIC_THEME_IDS,
} from './ambientCatalog.js';
import { structuredFeel } from './ambientProfiles.js';
import { CHESS_STUDIO_COLLECTION_IDS } from './ambientChessStudioCollection.js';

const CLASSICAL_IDS = ['queenSiciliana','rookPassacaglia','knightScherzo','blackKingPavane'];

describe('Chess Studio original score collection', () => {
  it('publishes four classical scores plus two studio choices', () => {
    expect(CHESS_STUDIO_COLLECTION_IDS).toHaveLength(6);
    expect(CLASSICAL_IDS.every((id) => AMBIENT_THEME_OPTIONS.some((theme) => theme.id === id && theme.genre === 'Clásica'))).toBe(true);
    expect(AMBIENT_THEME_OPTIONS.find((theme) => theme.id === 'sixtyFourVariations')?.genre).toBe('Piano / Minimal');
    expect(AMBIENT_THEME_OPTIONS.find((theme) => theme.id === 'flagFallFive')?.genre).toBe('Trip-Hop / Downtempo');
  });

  it('removes the complete eclectic family from the dial and its groups', () => {
    expect(AMBIENT_THEME_OPTIONS.some((theme) => theme.genre === 'Ecléctica')).toBe(false);
    expect(AMBIENT_THEME_GROUPS.some((group) => group.genre === 'Ecléctica')).toBe(false);
    expect(RETIRED_ECLECTIC_THEME_IDS.every((id) => !AMBIENT_THEME_OPTIONS.some((theme) => theme.id === id))).toBe(true);
  });

  it('gives every new score a long form and a distinct production identity', () => {
    const themes = CHESS_STUDIO_COLLECTION_IDS.map((id) => AMBIENT_THEMES[id]);
    const feels = themes.map((theme) => structuredFeel(theme));
    expect(themes.every((theme) => theme.longFormMs >= 360000 && theme.sections.length >= 4)).toBe(true);
    expect(new Set(feels.map((feel) => feel.family)).size).toBe(6);
    expect(new Set(feels.map((feel) => feel.finish.name)).size).toBe(6);
    expect(feels.every((feel) => feel.production?.grade === 'premium-v2')).toBe(true);
    expect(feels.every((feel) => feel.signature?.motif && Object.keys(feel.signature.motif).length >= 4)).toBe(true);
  });

  it('uses four different rooms and genuinely different classical ensembles', () => {
    const feels = CLASSICAL_IDS.map((id) => structuredFeel(AMBIENT_THEMES[id]));
    expect(new Set(feels.map((feel) => feel.finish.name)).size).toBe(4);
    expect(new Set(feels.map((feel) => `${feel.leadInstrument}|${feel.counterInstrument}|${feel.bassInstrument}`)).size).toBe(4);
  });
});
