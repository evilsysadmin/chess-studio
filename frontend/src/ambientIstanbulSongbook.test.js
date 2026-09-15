import { describe, expect, it } from 'vitest';
import { AMBIENT_THEME_OPTIONS, AMBIENT_THEMES } from './ambientCatalog.js';
import { structuredFeel } from './ambientProfiles.js';
import { getAmbientThemeSoundProfile } from './sound.js';
import { ISTANBUL_SONGBOOK_IDS } from './ambientIstanbulSongbook.js';

function melodicEvents(section) {
  return [...Object.entries(section.lead || {}), ...Object.entries(section.counter || {})]
    .map(([step, note]) => ({ step:Number(step), note:Number(note) }))
    .sort((a, b) => a.step - b.step);
}

function longestScalarRun(section) {
  const notes = melodicEvents(section).map(({ note }) => note);
  let longest = notes.length ? 1 : 0;
  let run = longest;
  let direction = 0;
  for (let i = 1; i < notes.length; i += 1) {
    const delta = notes[i] - notes[i - 1];
    const nextDirection = Math.sign(delta);
    const scalar = Math.abs(delta) > 0 && Math.abs(delta) <= 2;
    if (scalar && (direction === 0 || direction === nextDirection)) {
      run += 1;
      direction = nextDirection;
    } else {
      run = 1;
      direction = scalar ? nextDirection : 0;
    }
    longest = Math.max(longest, run);
  }
  return longest;
}

function largestMelodicGap(section) {
  const steps = melodicEvents(section).map(({ step }) => step);
  if (steps.length < 2) return Infinity;
  return Math.max(...steps.slice(1).map((step, index) => step - steps[index]));
}

describe('Istanbul songbook recomposition', () => {
  it('keeps the three published identities while replacing the underlying scores', () => {
    expect(ISTANBUL_SONGBOOK_IDS).toEqual(['istanbul0326', 'istanbulBackgammon', 'bosphorusRain']);
    for (const id of ISTANBUL_SONGBOOK_IDS) {
      const theme = AMBIENT_THEMES[id];
      const option = AMBIENT_THEME_OPTIONS.find((entry) => entry.id === id);
      expect(theme?.sections, id).toHaveLength(4);
      expect(option?.description, id).toBe(theme.description);
    }
    expect(AMBIENT_THEMES.istanbul0326.description).toContain('9/8');
    expect(AMBIENT_THEMES.istanbulBackgammon.description).toContain('Tavla');
    expect(AMBIENT_THEMES.bosphorusRain.description).toContain('sin percusión');
  });

  it('uses sparse phrases and real rests instead of ornamental scale runs', () => {
    for (const id of ISTANBUL_SONGBOOK_IDS) {
      const theme = AMBIENT_THEMES[id];
      for (const section of theme.sections) {
        expect(melodicEvents(section).length, `${id} density`).toBeLessThanOrEqual(10);
        expect(longestScalarRun(section), `${id} scalar run`).toBeLessThanOrEqual(3);
        expect(largestMelodicGap(section), `${id} breathing room`).toBeGreaterThanOrEqual(8);
      }
    }
  });

  it('keeps 03:26 a broken-meter prototype and preserves the authored player exchange', () => {
    const theme = AMBIENT_THEMES.istanbul0326;
    const profile = getAmbientThemeSoundProfile('istanbul0326');
    expect(profile.preserveSectionOrder).toBe(true);
    expect(profile.percussionPeriod).toBe(18);
    expect(profile.percussionKit).toBe('istanbul-frame');
    expect(profile.percussionPunch).toBeGreaterThan(1.3);
    expect(profile.estimatedBpm).toBeGreaterThanOrEqual(124);
    expect(profile.estimatedBpm).toBeLessThanOrEqual(130);
    expect(profile.enabledLayers).not.toContain('chords');
    expect(theme.sections.some((section) => section.leadInstrument && section.counterInstrument)).toBe(true);
  });

  it('makes Tavla dry and bass-forward while Bosphorus becomes a rain chamber', () => {
    const broken = structuredFeel(AMBIENT_THEMES.istanbul0326);
    const tavla = structuredFeel(AMBIENT_THEMES.istanbulBackgammon);
    const rain = structuredFeel(AMBIENT_THEMES.bosphorusRain);
    const rainProfile = getAmbientThemeSoundProfile('bosphorusRain');

    expect(new Set([broken.family, tavla.family, rain.family]).size).toBe(3);
    expect(tavla.mix.bass).toBeGreaterThan(broken.mix.bass);
    expect(tavla.releaseScale).toBeLessThan(broken.releaseScale);
    expect(rain.releaseScale).toBeGreaterThan(tavla.releaseScale);
    expect(rain.leadInstrument).toBe('feltGrand');
    expect(rainProfile.drumMode).toBe('none');
    expect(rainProfile.enabledLayers).not.toContain('drums');
  });
});
