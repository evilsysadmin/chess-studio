import { describe, expect, it } from 'vitest';
import { AMBIENT_THEMES } from './ambientCatalog.js';
import { structuredFeel } from './ambientProfiles.js';
import { RADIO_MATTHIAS_LEITMOTIFS } from './ambientRadioMatthiasLeitmotifs.js';
import { RADIO_PREMIUM_FORM_SPECS } from './ambientRadioPremiumForms.js';

const LEITMOTIF_IDS = Object.freeze(Object.keys(RADIO_MATTHIAS_LEITMOTIFS));

function orderedNotes(motif) {
  return Object.entries(motif || {})
    .sort(([left], [right]) => Number(left) - Number(right))
    .map(([, note]) => Number(note));
}

function intervalContour(motif) {
  const notes = orderedNotes(motif);
  return notes.slice(1).map((note, index) => note - notes[index]).join(',');
}

describe('Radio Matthias · leitmotivs premium', () => {
  it('da una firma escasa a los 13 temas modernos que aún no la tenían', () => {
    expect(LEITMOTIF_IDS).toHaveLength(13);

    for (const id of LEITMOTIF_IDS) {
      const theme = AMBIENT_THEMES[id];
      const spec = RADIO_MATTHIAS_LEITMOTIFS[id];
      const feel = structuredFeel(theme);
      const noteCount = Object.keys(feel.signature?.motif || {}).length;

      expect(theme?.id).toBe(id);
      expect(RADIO_PREMIUM_FORM_SPECS[id]).toBeTruthy();
      expect(feel.layers.signature).toBe(true);
      expect(noteCount).toBeGreaterThanOrEqual(3);
      expect(noteCount).toBeLessThanOrEqual(4);
      expect(feel.signature.everyCycles).toBeGreaterThanOrEqual(2);
      expect(feel.signature.volume).toBeLessThanOrEqual(0.22);
      expect(feel.signature.repeatPeriod).toBe(theme.stepsPerSection);
      expect(feel.signature.sections).toEqual(spec.sections);
    }
  });

  it('usa el instrumento real de cada tema y nunca apunta fuera de su escena', () => {
    for (const id of LEITMOTIF_IDS) {
      const theme = AMBIENT_THEMES[id];
      const spec = RADIO_MATTHIAS_LEITMOTIFS[id];
      const feel = structuredFeel(theme);
      const expectedInstrument = spec.instrumentRole === 'counter'
        ? theme.counterInstrument
        : spec.instrumentRole === 'chord'
          ? theme.chordInstrument
          : theme.leadInstrument;

      expect(feel.signature.instrument).toBe(expectedInstrument);
      for (const sectionIndex of feel.signature.sections) {
        expect(sectionIndex).toBeGreaterThanOrEqual(0);
        expect(sectionIndex).toBeLessThan(theme.sections.length);
      }
      for (const step of Object.keys(feel.signature.motif).map(Number)) {
        expect(step).toBeGreaterThanOrEqual(0);
        expect(step).toBeLessThan(theme.stepsPerSection);
      }
    }
  });

  it('hace reconocible cada firma por un contorno interválico propio', () => {
    const contours = LEITMOTIF_IDS.map((id) => intervalContour(structuredFeel(AMBIENT_THEMES[id]).signature.motif));
    expect(new Set(contours).size).toBe(contours.length);
  });

  it('mantiene intactas las firmas premium que Reactor, Tánger y Granada ya tenían', () => {
    const reactor = structuredFeel(AMBIENT_THEMES.reactorGambit);
    const tangier = structuredFeel(AMBIENT_THEMES.tangierSmoke);
    const granada = structuredFeel(AMBIENT_THEMES.granadaPatio);

    expect(reactor.signature.instrument).toBe('synth');
    expect(reactor.signature.everyCycles).toBe(2);
    expect(tangier.signature.instrument).toBe('clarinet');
    expect(tangier.signature.everyCycles).toBe(2);
    expect(granada.signature.instrument).toBe('guitar2');
    expect(granada.signature.repeatPeriod).toBe(96);
  });
});
