import { describe, expect, it } from 'vitest';
import { AMBIENT_THEMES } from './ambientCatalog.js';
import { structuredFeel } from './ambientProfiles.js';
import { ROCK_PRODUCTION_IDS } from './ambientRockProduction.js';
import { getPercussionVoiceKit } from './sound.js';

const IDS = ['postRockMidnight', 'rookGarage', 'desertDriveRock'];

function contour(motif = {}) {
  const notes = Object.values(motif);
  return notes.slice(1).map((note, index) => note - notes[index]).join(',');
}

describe('rock production identities', () => {
  it('routes every rock score to its own live kit and room', () => {
    expect(ROCK_PRODUCTION_IDS).toEqual(IDS);
    const feels = IDS.map((id) => structuredFeel(AMBIENT_THEMES[id]));

    expect(new Set(feels.map((feel) => feel.family)).size).toBe(IDS.length);
    expect(new Set(feels.map((feel) => feel.percussion.kit)).size).toBe(IDS.length);
    expect(new Set(feels.map((feel) => feel.percussion.period)).size).toBe(IDS.length);
    IDS.forEach((id, index) => expect(getPercussionVoiceKit(id)).toBe(feels[index].percussion.kit));
  });

  it('makes the three guitar productions materially different', () => {
    const post = structuredFeel(AMBIENT_THEMES.postRockMidnight);
    const garage = structuredFeel(AMBIENT_THEMES.rookGarage);
    const desert = structuredFeel(AMBIENT_THEMES.desertDriveRock);

    expect(post.leadInstrument).toBe('tremoloGuitar');
    expect(post.space).toBeGreaterThan(garage.space);
    expect(post.releaseScale).toBeGreaterThan(garage.releaseScale);
    expect(garage.leadInstrument).toBe('overdriveGuitar');
    expect(garage.chordInstrument).toBe('overdriveGuitar');
    expect(garage.percussion.punch).toBeGreaterThan(1.2);
    expect(desert.leadInstrument).toBe('guitar2');
    expect(desert.chordInstrument).toBe('tremoloGuitar');
    expect(desert.swing).toBeGreaterThan(post.swing);
  });

  it('locks the garage backbeat to the six-step guitar riff', () => {
    const garage = structuredFeel(AMBIENT_THEMES.rookGarage);
    const riffSteps = Object.keys(AMBIENT_THEMES.rookGarage.sections[0].lead).map(Number);
    const backbone = Object.entries(garage.percussion.pattern)
      .filter(([, voice]) => voice === 'K' || voice === 'S')
      .map(([step]) => Number(step));

    expect(garage.percussion.period).toBe(12);
    expect(riffSteps.slice(1).map((step, index) => step - riffSteps[index])).toEqual(Array(7).fill(6));
    expect(backbone).toEqual([0, 6]);
  });

  it('gives every score a recurring hook with a distinct contour', () => {
    const feels = IDS.map((id) => structuredFeel(AMBIENT_THEMES[id]));
    expect(new Set(feels.map((feel) => contour(feel.signature.motif))).size).toBe(IDS.length);

    for (const feel of feels) {
      expect(feel.layers.signature).toBe(true);
      expect(Object.keys(feel.signature.motif).length).toBeGreaterThanOrEqual(4);
      expect(feel.signature.everyCycles).toBe(2);
      expect(feel.signature.repeatPeriod).toBeGreaterThanOrEqual(48);
    }
  });
});
