import { describe, expect, it } from 'vitest';
import { structuredFeel } from './ambientProfiles.js';
import { AMBIENT_THEMES } from './ambientCatalog.js';

describe('Granada · cámara guitarra + qanun', () => {
  it('preserva el patio de guitarra, qanun y pizzicato sin batería', () => {
    const feel = structuredFeel(AMBIENT_THEMES.granadaPatio);

    expect(feel.family).toBe('granada-guitar-qanun-chamber');
    expect(feel.leadInstrument).toBe('nylonGuitar');
    expect(feel.counterInstrument).toBe('qanun');
    expect(feel.bassInstrument).toBe('pizz');
    expect(feel.layers).toMatchObject({ lead: true, counter: true, chords: true, bass: true, drums: false, signature: true });
    expect(feel.mix.lead).toBeGreaterThan(feel.mix.counter);
    expect(feel.drumMode).toBe('none');
    expect(feel.percussion.kit).toBe('none');
    expect(feel.signature.repeatPeriod).toBe(96);
    expect(feel.signature.everyCycles).toBe(2);
    expect(Math.max(...Object.keys(feel.signature.motif).map(Number))).toBeLessThan(AMBIENT_THEMES.granadaPatio.stepsPerSection);
  });

  it('deja que lluvia de cobre use el clarinete y cello que describe su partitura', () => {
    const patio = structuredFeel(AMBIENT_THEMES.granadaPatio);
    const rain = structuredFeel(AMBIENT_THEMES.granadaCopperRain0232);

    expect(rain.family).toBe('granada-guitar-clarinet-rain-chamber');
    expect(rain.leadInstrument).toBe('nylonGuitar');
    expect(rain.counterInstrument).toBe('clarinet');
    expect(rain.bassInstrument).toBe('cello');
    expect(rain.percussion.kit).toBe('none');
    expect(rain.layers.drums).toBe(false);
    expect(rain.signature.instrument).toBe('clarinet');
    expect(rain.signature.repeatPeriod).toBe(AMBIENT_THEMES.granadaCopperRain0232.stepsPerSection);
    expect(Math.max(...Object.keys(rain.signature.motif).map(Number))).toBeLessThan(AMBIENT_THEMES.granadaCopperRain0232.stepsPerSection);
    expect(rain.signature.motif).not.toEqual(patio.signature.motif);
    expect(rain.harmonyPath).not.toEqual(patio.harmonyPath);
    expect(rain.space).toBeGreaterThan(patio.space + 0.05);
    expect(rain.delayMs).toBeGreaterThan(patio.delayMs + 80);
  });

  it('separa la percusión de cuerda de Cuatro casillas del cello sostenido de Lluvia vertical', () => {
    const squares = structuredFeel(AMBIENT_THEMES.fourSquares);
    const rain = structuredFeel(AMBIENT_THEMES.verticalRainPiano);
    expect(squares.counterInstrument).toBe('pizz');
    expect(rain.counterInstrument).toBe('cello');
    expect(squares.leadInstrument).toBe('felt');
    expect(squares.layers.drums).toBe(false);
    expect(rain.layers.drums).toBe(false);
  });

  it('delega intactas las demás familias al catálogo existente', () => {
    const cairo = structuredFeel({ id: 'cairo0047' });
    expect(cairo.family).toBe('cairo-rhodes-horn-noir');
    expect(cairo.layers.drums).toBe(true);
  });
});
