import { structuredFeel as legacyStructuredFeel } from './ambientProfilesLegacy.js';

const GRANADA_THEME_IDS = new Set(['granadaPatio', 'granadaCopperRain0232']);

const GRANADA_MELODIC_PROFILE = Object.freeze({
  family: 'granada-guitar-qanun-chamber',
  harmonyPath: Object.freeze([0, 0, 5, 3, 0, -2, 0, 0]),
  swing: 0.025,
  warmth: 1.04,
  releaseScale: 1.16,
  space: 0.22,
  delayMs: 225,
  chordHoldSteps: 20,
  bassHoldSteps: 4,
  layers: Object.freeze({ lead: true, counter: true, chords: true, bass: true, drums: false, signature: true }),
  mix: Object.freeze({ lead: 0.62, counter: 0.34, bass: 0.42, chord: 0.38 }),
  signature: Object.freeze({
    instrument: 'guitar2',
    sections: Object.freeze([0, 2]),
    everyCycles: 2,
    repeatPeriod: 96,
    durationSteps: 4.2,
    volume: 0.28,
    motif: Object.freeze({ 6: 64, 30: 68, 54: 63, 78: 61 }),
  }),
});

// Facade deliberadamente pequeño: conserva todas las identidades existentes
// y profundiza sólo Granada. La guitarra de nylon vuelve a llevar las frases
// completas; el qanun responde como contrapunto y la firma queda como detalle
// ocasional. Sigue sin batería para mantener el carácter nocturno/de cámara.
export function structuredFeel(theme) {
  const legacy = legacyStructuredFeel(theme);
  if (!legacy || !GRANADA_THEME_IDS.has(theme?.id)) return legacy;
  return Object.freeze({
    ...legacy,
    ...GRANADA_MELODIC_PROFILE,
    leadInstrument: 'nylonGuitar',
    counterInstrument: 'qanun',
    drumMode: 'none',
    percussion: Object.freeze({ period: 32, kit: 'none', punch: 0, pattern: Object.freeze({}) }),
  });
}
