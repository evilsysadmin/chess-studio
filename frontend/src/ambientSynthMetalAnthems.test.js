import { describe, expect, it } from 'vitest';
import { AMBIENT_THEME_OPTIONS, AMBIENT_THEMES } from './ambientCatalog.js';
import { structuredFeel } from './ambientProfiles.js';
import { SYNTH_METAL_ANTHEM_IDS, SYNTH_METAL_ANTHEMS } from './ambientSynthMetalAnthems.js';

function rhythm(line = {}) {
  return Object.keys(line).join(',');
}

describe('Synth Metal · anthem rebuild', () => {
  it('rebuilds all three scores as multi-scene original anthems', () => {
    expect(SYNTH_METAL_ANTHEM_IDS).toEqual(['neonSiege', 'overclockedKnight', 'reactorGambit']);
    for (const id of SYNTH_METAL_ANTHEM_IDS) {
      const theme = AMBIENT_THEMES[id];
      expect(theme.description).toBe(SYNTH_METAL_ANTHEMS[id].description);
      expect(AMBIENT_THEME_OPTIONS.find((option) => option.id === id)?.description).toBe(theme.description);
      expect(theme.sections.length).toBeGreaterThanOrEqual(4);
      expect(new Set(theme.sections.map((part) => rhythm(part.lead))).size).toBeGreaterThanOrEqual(3);
      expect(theme.sections.some((part) => Object.values(part.lead).some((note) => note >= 64))).toBe(true);
      expect(theme.sections.filter((part) => Object.keys(part.counter || {}).length >= 4).length)
        .toBeGreaterThanOrEqual(theme.sections.length - 2);
      expect(theme.sections.reduce((total, part) => total + Object.keys(part.counter || {}).length, 0))
        .toBeGreaterThanOrEqual(24);
    }
  });

  it('puts the three tempos in distinct anthem, gallop and cinematic pockets', () => {
    const bpm = Object.fromEntries(SYNTH_METAL_ANTHEM_IDS.map((id) => [id, 60000 / (AMBIENT_THEMES[id].stepMs * 4)]));
    expect(bpm.neonSiege).toBeGreaterThanOrEqual(165);
    expect(bpm.neonSiege).toBeLessThanOrEqual(175);
    expect(bpm.overclockedKnight).toBeCloseTo(150, 1);
    expect(bpm.reactorGambit).toBeCloseTo(125, 1);

    const kits = SYNTH_METAL_ANTHEM_IDS.map((id) => structuredFeel(AMBIENT_THEMES[id]).percussion.kit);
    expect(new Set(kits).size).toBe(kits.length);
    expect(kits).toEqual(['synth-metal-anthem', 'synth-metal-gallop', 'synth-metal-cinematic']);
  });

  it('balances thunderous guitar riffs with soaring synth voices and authored fills', () => {
    const siege = structuredFeel(AMBIENT_THEMES.neonSiege);
    const gallop = structuredFeel(AMBIENT_THEMES.overclockedKnight);
    const reactor = structuredFeel(AMBIENT_THEMES.reactorGambit);

    expect([siege.leadInstrument, gallop.counterInstrument, reactor.leadInstrument]).toEqual([
      'overdriveGuitar', 'overdriveGuitar', 'overdriveGuitar',
    ]);
    expect([siege.counterInstrument, gallop.leadInstrument, reactor.counterInstrument]).toEqual([
      'anthemLead', 'anthemLead', 'neonBrass',
    ]);
    for (const feel of [siege, gallop, reactor]) {
      expect(Object.values(feel.percussion.pattern)).toContain('M');
      expect(feel.percussion.punch).toBeGreaterThanOrEqual(1.3);
      expect(Object.keys(feel.signature.motif)).toHaveLength(4);
    }
  });
});
