import { describe, expect, it } from 'vitest';
import { AMBIENT_THEME_GROUPS, AMBIENT_THEME_OPTIONS, AMBIENT_THEMES } from './ambientCatalog.js';
import { structuredFeel } from './ambientProfiles.js';
import {
  NIGHT_DRIVE_JAZZ_GENRE,
  NIGHT_DRIVE_JAZZ_PROFILES,
  NIGHT_DRIVE_JAZZ_THEME_IDS,
  NIGHT_DRIVE_JAZZ_THEMES,
} from './ambientNightDriveJazz.js';

function eventCount(line = {}) {
  return Object.keys(line).length;
}

function productionChain(id) {
  const feel = structuredFeel(AMBIENT_THEMES[id]);
  return [feel.leadInstrument, feel.counterInstrument, feel.chordInstrument, feel.bassInstrument, feel.percussion?.kit].join('/');
}

describe('Smooth Jazz · night-drive songbook', () => {
  it('publishes both originals inside Smooth Jazz without inventing another genre', () => {
    expect(NIGHT_DRIVE_JAZZ_THEME_IDS).toEqual(['neonBoulevard', 'lastExitAfterHours']);
    const smooth = AMBIENT_THEME_GROUPS.find((group) => group.genre === NIGHT_DRIVE_JAZZ_GENRE);

    for (const id of NIGHT_DRIVE_JAZZ_THEME_IDS) {
      expect(AMBIENT_THEMES[id]).toBe(NIGHT_DRIVE_JAZZ_THEMES[id]);
      expect(AMBIENT_THEME_OPTIONS.some((option) => option.id === id && option.genre === 'Smooth Jazz')).toBe(true);
      expect(smooth?.themes.some((theme) => theme.id === id)).toBe(true);
    }
  });

  it('keeps a restrained late-night tempo with written pocket in every section', () => {
    for (const theme of Object.values(NIGHT_DRIVE_JAZZ_THEMES)) {
      const bpm = 60000 / (theme.stepMs * 4);
      expect(bpm).toBeGreaterThanOrEqual(98);
      expect(bpm).toBeLessThanOrEqual(100);
      expect(theme.sections).toHaveLength(3);

      for (const section of theme.sections) {
        expect(eventCount(section.lead)).toBeGreaterThanOrEqual(9);
        expect(eventCount(section.chords)).toBeGreaterThanOrEqual(8);
        expect(eventCount(section.bass)).toBeGreaterThanOrEqual(16);
      }
    }
  });

  it('gives the two tracks different bands instead of another cloned smooth-jazz preset', () => {
    expect(new Set(NIGHT_DRIVE_JAZZ_THEME_IDS.map(productionChain)).size).toBe(NIGHT_DRIVE_JAZZ_THEME_IDS.length);

    const neon = structuredFeel(AMBIENT_THEMES.neonBoulevard);
    const exit = structuredFeel(AMBIENT_THEMES.lastExitAfterHours);
    expect(neon.family).toBe('night-drive-rhodes-funk-pocket');
    expect(neon.leadInstrument).toBe('rhodesWarm');
    expect(neon.counterInstrument).toBe('jazzGuitar');
    expect(exit.family).toBe('night-drive-hollowbody-last-exit');
    expect(exit.leadInstrument).toBe('jazzGuitar');
    expect(exit.counterInstrument).toBe('mutedHorn');
  });

  it('uses the horn as an occasional answer, not smooth-jazz wallpaper', () => {
    const theme = NIGHT_DRIVE_JAZZ_THEMES.lastExitAfterHours;
    const profile = NIGHT_DRIVE_JAZZ_PROFILES.lastExitAfterHours;

    expect(Math.max(...theme.sections.map((section) => eventCount(section.counter)))).toBeLessThanOrEqual(4);
    expect(profile.mix.counter).toBeLessThanOrEqual(0.18);
    expect(profile.signature.everyCycles).toBeGreaterThanOrEqual(3);
    expect(profile.signature.volume).toBeLessThanOrEqual(0.13);
  });
});
