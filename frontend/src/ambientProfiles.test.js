import { describe, expect, it } from 'vitest';
import { structuredFeel } from './ambientProfiles.js';

describe('Granada · cámara guitarra + qanun', () => {
  it.each(['granadaPatio', 'granadaCopperRain0232'])('da protagonismo melódico real a %s sin añadir batería', (id) => {
    const feel = structuredFeel({ id });

    expect(feel.family).toBe('granada-guitar-qanun-chamber');
    expect(feel.leadInstrument).toBe('nylonGuitar');
    expect(feel.counterInstrument).toBe('qanun');
    expect(feel.layers).toMatchObject({ lead: true, counter: true, chords: true, bass: true, drums: false, signature: true });
    expect(feel.mix.lead).toBeGreaterThan(feel.mix.counter);
    expect(feel.drumMode).toBe('none');
    expect(feel.percussion.kit).toBe('none');
    expect(feel.signature.repeatPeriod).toBe(96);
    expect(feel.signature.everyCycles).toBe(2);
  });

  it('delega intactas las demás familias al catálogo existente', () => {
    const cairo = structuredFeel({ id: 'cairo0047' });
    expect(cairo.family).toBe('cairo-rhodes-horn-noir');
    expect(cairo.layers.drums).toBe(true);
  });
});
