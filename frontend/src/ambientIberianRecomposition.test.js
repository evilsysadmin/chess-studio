import { describe, expect, it } from 'vitest';
import { AMBIENT_THEMES } from './ambientCatalog.js';
import { structuredFeel } from './ambientProfiles.js';
import { IBERIAN_RECOMPOSITION_IDS } from './ambientIberianRecomposition.js';

describe('Costa andalusí / Málaga · recomposición real', () => {
  it('keeps both published themes but gives them different clocks and score density', () => {
    expect(IBERIAN_RECOMPOSITION_IDS).toEqual(['andalusianCoast', 'malagaLastTram']);

    const coast = AMBIENT_THEMES.andalusianCoast;
    const malaga = AMBIENT_THEMES.malagaLastTram;
    expect(coast.stepMs).toBe(132);
    expect(malaga.stepMs).toBe(176);
    expect(malaga.stepMs / coast.stepMs).toBeGreaterThan(1.3);

    const coastLead = Object.keys(coast.sections[0].lead).map(Number);
    const malagaLead = Object.keys(malaga.sections[0].lead).map(Number);
    expect(coastLead).toHaveLength(16);
    expect(malagaLead).toHaveLength(8);
    expect(coastLead.every((step) => step % 4 === 0)).toBe(true);
    expect(malagaLead).not.toEqual(coastLead);
  });

  it('separates melodic contour, final harmony cadence and ensemble', () => {
    const coast = AMBIENT_THEMES.andalusianCoast;
    const malaga = AMBIENT_THEMES.malagaLastTram;

    expect(Object.values(coast.sections[0].lead)).not.toEqual(Object.values(malaga.sections[0].lead));
    const coastChords = Object.keys(coast.sections[0].chords).map(Number);
    const malagaChords = Object.keys(malaga.sections[0].chords).map(Number);
    expect(coastChords).toHaveLength(4);
    expect(malagaChords).toHaveLength(3);
    expect(coastChords).not.toEqual(malagaChords);

    const coastFeel = structuredFeel(coast);
    const malagaFeel = structuredFeel(malaga);
    expect([coastFeel.leadInstrument, coastFeel.counterInstrument, coastFeel.percussion.kit])
      .not.toEqual([malagaFeel.leadInstrument, malagaFeel.counterInstrument, malagaFeel.percussion.kit]);
    expect(coastFeel.percussion.period).toBe(16);
    expect(malagaFeel.percussion.period).toBe(32);
  });
});
