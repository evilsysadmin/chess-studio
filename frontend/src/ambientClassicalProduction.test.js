import { describe, expect, it } from 'vitest';
import { AMBIENT_THEMES } from './ambientCatalog.js';
import { structuredFeel } from './ambientProfiles.js';
import { CLASSICAL_PRODUCTION_IDS } from './ambientClassicalProduction.js';
import { ORCHESTRAL_SAMPLE_LIBRARY } from './orchestralSampler.js';
import { getPercussionVoiceKit } from './sound.js';

describe('classical production', () => {
  it('places every classical score in its own room with a valid recurring phrase', () => {
    expect(CLASSICAL_PRODUCTION_IDS).toHaveLength(13);
    const feels = CLASSICAL_PRODUCTION_IDS.map((id) => structuredFeel(AMBIENT_THEMES[id]));
    expect(new Set(feels.map((feel) => feel.finish.name)).size).toBe(CLASSICAL_PRODUCTION_IDS.length);
    CLASSICAL_PRODUCTION_IDS.forEach((id, index) => {
      const theme = AMBIENT_THEMES[id];
      const feel = feels[index];
      expect(Object.keys(feel.signature.motif).length).toBeGreaterThanOrEqual(4);
      expect(feel.signature.sections.every((section) => section < theme.sections.length)).toBe(true);
    });
  });

  it('uses recorded long and short bows as distinct orchestral sections', () => {
    const adagio = structuredFeel(AMBIENT_THEMES.endgameAdagio);
    const fugue = structuredFeel(AMBIENT_THEMES.knightFugue);
    const quartet = structuredFeel(AMBIENT_THEMES.nocturnalQuartet);
    const overture = structuredFeel(AMBIENT_THEMES.clockworkOverture);

    expect(ORCHESTRAL_SAMPLE_LIBRARY[adagio.leadInstrument]).toBeTruthy();
    expect(ORCHESTRAL_SAMPLE_LIBRARY[quartet.counterInstrument]).toBeTruthy();
    expect(fugue.counterInstrument).toBe('spiccatoStrings');
    expect(fugue.bassInstrument).toBe('spiccatoCello');
    expect(overture.leadInstrument).toBe('spiccatoStrings');
    expect(overture.counterInstrument).toBe('feltGrand');
  });

  it('gives baroque, western, Baltic, tango and waltz pulses different players', () => {
    const ids = ['gambit', 'duel', 'rigaRain', 'kingTango', 'zugzwangWaltz'];
    expect(ids.map((id) => getPercussionVoiceKit(id))).toEqual([
      'baroque-wood',
      'western-brush',
      'riga-rain-glass',
      'tango-stage',
      'chamber-waltz',
    ]);
    expect(new Set(ids.map((id) => structuredFeel(AMBIENT_THEMES[id]).family)).size).toBe(ids.length);
  });

  it('keeps the requiem and cathedral spacious without turning them into the same organ preset', () => {
    const cathedral = structuredFeel(AMBIENT_THEMES.cathedral);
    const requiem = structuredFeel(AMBIENT_THEMES.queenRequiem);
    expect(cathedral.signature.instrument).toBe('choir');
    expect(requiem.signature.instrument).toBe('strings');
    expect(cathedral.bassInstrument).toBe('organbass');
    expect(requiem.bassInstrument).toBe('cello');
    expect(cathedral.finish.name).not.toBe(requiem.finish.name);
  });
});
