import { describe, expect, it } from 'vitest';
import { AMBIENT_THEME_OPTIONS, AMBIENT_THEMES } from './ambientCatalog.js';
import { structuredFeel } from './ambientProfiles.js';
import {
  BEIRUT_PROFILES,
  BEIRUT_SONGBOOK_IDS,
  BEIRUT_SONGBOOK_REWRITES,
} from './ambientBeirutSongbook.js';

function entries(line = {}) {
  return Object.entries(line).map(([step, note]) => [Number(step), Number(note)]).sort((a, b) => a[0] - b[0]);
}

function longestMonotonicStepwiseRun(line = {}) {
  const notes = entries(line).map(([, note]) => note);
  let longest = notes.length ? 1 : 0;
  let run = longest;
  let direction = 0;
  for (let i = 1; i < notes.length; i += 1) {
    const interval = notes[i] - notes[i - 1];
    const nextDirection = Math.sign(interval);
    const stepwise = nextDirection !== 0 && Math.abs(interval) <= 2;
    if (stepwise && (direction === 0 || direction === nextDirection)) run += 1;
    else run = stepwise ? 2 : 1;
    direction = stepwise ? nextDirection : 0;
    longest = Math.max(longest, run);
  }
  return longest;
}

function largestGap(line = {}) {
  const steps = entries(line).map(([step]) => step);
  if (steps.length < 2) return 72;
  return Math.max(...steps.slice(1).map((step, index) => step - steps[index]));
}

function fingerprint(theme) {
  return JSON.stringify(theme.sections.map((scene) => [scene.lead, scene.counter, scene.chords, scene.bass]));
}

describe('Beirut nocturnal songbook', () => {
  it('keeps all four authored Beirut scores while the rejected taxi is no longer published', () => {
    expect(BEIRUT_SONGBOOK_IDS).toEqual([
      'beirut0113', 'beirutRooftop0412', 'beirutNightTaxi', 'beirutHarbor2340',
    ]);

    for (const id of BEIRUT_SONGBOOK_IDS) {
      const theme = AMBIENT_THEMES[id];
      const option = AMBIENT_THEME_OPTIONS.find((entry) => entry.id === id);
      expect(theme).toBeTruthy();
      expect(theme.sections).toBe(BEIRUT_SONGBOOK_REWRITES[id].sections);
      expect(theme.sections).toHaveLength(4);
      if (id === 'beirutNightTaxi') expect(option).toBeUndefined();
      else expect(option?.description).toBe(theme.description);
    }
  });

  it('writes compact motifs with actual rests instead of continuous oriental scale runs', () => {
    for (const id of BEIRUT_SONGBOOK_IDS) {
      for (const scene of AMBIENT_THEMES[id].sections) {
        const leadCount = Object.keys(scene.lead).length;
        const counterCount = Object.keys(scene.counter).length;
        expect(leadCount, `${id} lead density`).toBeGreaterThanOrEqual(5);
        expect(leadCount, `${id} lead density`).toBeLessThanOrEqual(7);
        expect(counterCount, `${id} counter density`).toBeLessThanOrEqual(3);
        expect(largestGap(scene.lead), `${id} breathing room`).toBeGreaterThanOrEqual(12);
        expect(longestMonotonicStepwiseRun(scene.lead), `${id} scalar run`).toBeLessThanOrEqual(3);
      }
    }
  });

  it('gives every Beirut scene its own written song rather than four variants of one template', () => {
    const fingerprints = BEIRUT_SONGBOOK_IDS.map((id) => fingerprint(AMBIENT_THEMES[id]));
    expect(new Set(fingerprints).size).toBe(BEIRUT_SONGBOOK_IDS.length);
    expect(new Set(BEIRUT_SONGBOOK_IDS.map((id) => BEIRUT_PROFILES[id].family)).size).toBe(BEIRUT_SONGBOOK_IDS.length);
    expect(new Set(BEIRUT_SONGBOOK_IDS.map((id) => JSON.stringify(BEIRUT_PROFILES[id].harmonyPath))).size).toBe(BEIRUT_SONGBOOK_IDS.length);
  });

  it('does not inherit the loud legacy buzuq alarm in Beirut 01:13', () => {
    const feel = structuredFeel(AMBIENT_THEMES.beirut0113);

    expect(feel.leadInstrument).toBe('nylonGuitar');
    expect(feel.counterInstrument).toBe('clarinet');
    expect(feel.signature.instrument).toBe('buzuq');
    expect(feel.signature.everyCycles).toBeGreaterThanOrEqual(3);
    expect(feel.signature.repeatPeriod).toBeGreaterThanOrEqual(96);
    expect(feel.signature.volume).toBeLessThanOrEqual(0.13);
    expect(Object.keys(feel.signature.motif)).toHaveLength(4);
  });

  it('preserves the retired taxi production identity for compatibility and future rework', () => {
    const rooftop = structuredFeel(AMBIENT_THEMES.beirutRooftop0412);
    const taxi = structuredFeel(AMBIENT_THEMES.beirutNightTaxi);

    expect(rooftop.family).toBe('beirut-rooftop-suspended-dialogue');
    expect(taxi.family).toBe('beirut-night-taxi-pocket');
    expect(rooftop.leadInstrument).toBe('clarinet');
    expect(taxi.leadInstrument).toBe('nylonGuitar');
    expect(taxi.mix.bass).toBeGreaterThan(rooftop.mix.bass);
    expect(taxi.releaseScale).toBeLessThan(rooftop.releaseScale);
  });
});
