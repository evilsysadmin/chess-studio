import { describe, expect, it } from 'vitest';
import { AMBIENT_THEME_OPTIONS, AMBIENT_THEMES } from './ambientCatalog.js';
import { structuredFeel } from './ambientProfiles.js';
import { getAmbientThemeSoundProfile } from './sound.js';
import { MEDITERRANEAN_CHORD_ATTACK_PLANS } from './ambientMediterraneanChordArticulation.js';
import { BASS_ATTACK_PLANS } from './ambientBassPhrasingDiversity.js';
import { EGYPT_NILE_SONGBOOK_IDS } from './ambientEgyptNileSongbook.js';

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

describe('Egypt and Nile songbook recomposition', () => {
  it('keeps all six published ids and synchronizes their rewritten descriptions', () => {
    expect(EGYPT_NILE_SONGBOOK_IDS).toHaveLength(6);
    for (const id of EGYPT_NILE_SONGBOOK_IDS) {
      const theme = AMBIENT_THEMES[id];
      const option = AMBIENT_THEME_OPTIONS.find((entry) => entry.id === id);
      expect(theme?.sections?.length, id).toBeGreaterThanOrEqual(3);
      expect(option?.description, id).toBe(theme.description);
    }
  });

  it('uses sparse authored phrases instead of decorative scale runs', () => {
    for (const id of EGYPT_NILE_SONGBOOK_IDS.filter((id) => id !== 'alexandria241')) {
      for (const section of AMBIENT_THEMES[id].sections) {
        expect(melodicEvents(section).length, `${id} density`).toBeLessThanOrEqual(9);
        expect(longestScalarRun(section), `${id} scalar run`).toBeLessThanOrEqual(3);
        expect(largestMelodicGap(section), `${id} breathing room`).toBeGreaterThanOrEqual(8);
      }
    }
  });

  it('embraces Alexandria as the minimal piano trio its production contract already described', () => {
    const profile = getAmbientThemeSoundProfile('alexandria241');
    expect(profile.family).toBe('alexandria-minimal-piano-trio');
    expect(profile.chordInstrument).toBe('felt');
    expect(profile.percussionPeriod).toBe(16);
    expect(profile.enabledLayers).toEqual(expect.arrayContaining(['chords','bass','drums','signature']));
    expect(profile.enabledLayers).not.toContain('lead');
    expect(profile.enabledLayers).not.toContain('counter');
    expect(AMBIENT_THEMES.alexandria241.sections.every((section) => melodicEvents(section).length === 0)).toBe(true);
  });

  it('keeps Cairo 00:47 on its stable boundary family while separating the three Cairo rooms', () => {
    const cairo = structuredFeel(AMBIENT_THEMES.cairo0047);
    const quiet = structuredFeel(AMBIENT_THEMES.cairoQuietHours);
    const red = structuredFeel(AMBIENT_THEMES.cairoRedLantern);
    const blue = structuredFeel(AMBIENT_THEMES.cairoBlueNote0211);

    expect(cairo.family).toBe('cairo-rhodes-horn-noir');
    expect(cairo.chordInstrument).toBe('rhodesWarm');
    expect(new Set([cairo.family, quiet.family, red.family, blue.family]).size).toBe(4);
    expect(red.mix.bass).toBeGreaterThan(quiet.mix.bass);
    expect(red.releaseScale).toBeLessThan(blue.releaseScale);
    expect(red.leadInstrument).toBe('jazzGuitar');
    expect(blue.leadInstrument).toBe('mutedHorn');
  });

  it('preserves Cairo Quiet and Nile harmonic attack contracts after the rewrite', () => {
    for (const id of ['cairoQuietHours','nileBalcony0152']) {
      expect(AMBIENT_THEMES[id].sections.map((section) => Object.keys(section.chords || {}).map(Number)), id)
        .toEqual(MEDITERRANEAN_CHORD_ATTACK_PLANS[id]);
    }
  });

  it('preserves Blue Note bass phrasing counts and its downstream attack plan', () => {
    expect(AMBIENT_THEMES.cairoBlueNote0211.sections.map((section) => Object.keys(section.bass || {}).map(Number)))
      .toEqual(BASS_ATTACK_PLANS.cairoBlueNote0211);
  });

  it('keeps Quiet Hours grounded and Nile weightless by actual production decisions', () => {
    const quiet = getAmbientThemeSoundProfile('cairoQuietHours');
    const nile = getAmbientThemeSoundProfile('nileBalcony0152');
    expect(quiet.family).not.toBe(nile.family);
    expect(quiet.percussionKit).not.toBe(nile.percussionKit);
    expect(quiet.drumMode).not.toBe(nile.drumMode);
    expect(quiet.signatureInstrument).not.toBe(nile.signatureInstrument);
    expect(quiet.enabledLayers).toContain('drums');
    expect(nile.enabledLayers).not.toContain('drums');
    expect(nile.leadInstrument).toBe('warmVibes');
    expect(nile.bassInstrument).toBe('cello');
  });
});
