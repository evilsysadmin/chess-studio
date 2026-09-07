import { describe, expect, it } from 'vitest';
import { AMBIENT_THEMES } from './ambientCatalog.js';
import { structuredFeel } from './ambientProfiles.js';
import {
  TROPICAL_HOUSE_MELODY_IDS,
  TROPICAL_HOUSE_MELODY_REWRITES,
} from './ambientTropicalHouseMelody.js';

const IDS = ['palmsAtDusk', 'islandKnight', 'bishopSunset'];

function notes(line = {}) {
  return Object.values(line).map(Number);
}

function eventCount(line = {}) {
  return Object.keys(line).length;
}

function uniquePitchCount(line = {}) {
  return new Set(notes(line)).size;
}

function pitchSpan(line = {}) {
  const values = notes(line);
  return values.length ? Math.max(...values) - Math.min(...values) : 0;
}

function contour(line = {}) {
  const values = notes(line);
  return values.slice(1).map((note, index) => note - values[index]).join(',');
}

describe('Tropical House · melodic lift', () => {
  it('gives all three published themes real multi-note phrases and counter-lines', () => {
    expect(TROPICAL_HOUSE_MELODY_IDS).toEqual(IDS);

    for (const id of IDS) {
      const rewrite = TROPICAL_HOUSE_MELODY_REWRITES[id];
      expect(rewrite.melodySections.length).toBeGreaterThanOrEqual(2);

      for (const section of rewrite.melodySections) {
        expect(eventCount(section.lead)).toBeGreaterThanOrEqual(13);
        expect(uniquePitchCount(section.lead)).toBeGreaterThanOrEqual(6);
        expect(pitchSpan(section.lead)).toBeGreaterThanOrEqual(7);
        expect(eventCount(section.counter)).toBeGreaterThanOrEqual(6);
        expect(uniquePitchCount(section.counter)).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it('keeps each lead contour recognizably different instead of sharing one house template', () => {
    const fingerprints = IDS.map((id) => contour(TROPICAL_HOUSE_MELODY_REWRITES[id].melodySections[0].lead));
    expect(new Set(fingerprints).size).toBe(IDS.length);
  });

  it('installs enough melody across the final long-form themes without losing the dance groove', () => {
    for (const id of IDS) {
      const theme = AMBIENT_THEMES[id];
      const feel = structuredFeel(theme);
      const totalLeadEvents = theme.sections.reduce((sum, section) => sum + eventCount(section.lead), 0);
      const finalLeadNotes = theme.sections.flatMap((section) => notes(section.lead));

      expect(totalLeadEvents).toBeGreaterThanOrEqual(36);
      expect(new Set(finalLeadNotes).size).toBeGreaterThanOrEqual(8);
      expect(theme.sections.some((section) => eventCount(section.lead) >= 12)).toBe(true);

      for (const section of theme.sections) {
        for (const step of [...Object.keys(section.lead || {}), ...Object.keys(section.counter || {})].map(Number)) {
          expect(step).toBeGreaterThanOrEqual(0);
          expect(step).toBeLessThan(theme.stepsPerSection);
        }
      }

      expect(feel.percussion.kit).toBe('tropical-house-sidechain');
      expect(feel.layers.signature).toBe(true);
      expect(feel.signature).toBeTruthy();
    }
  });
});
