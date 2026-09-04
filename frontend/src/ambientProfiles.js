import { structuredFeel as legacyStructuredFeel } from './ambientProfilesLegacy.js';
import {
  AMBIENT_GENRE_ORDER,
  AMBIENT_THEMES,
  AMBIENT_THEME_GROUPS,
  AMBIENT_THEME_OPTIONS,
  CURATED_HIDDEN_THEME_IDS,
} from './ambientCatalog.js';
import { installRadioMatthiasExpansion } from './ambientRadioMatthiasExpansion.js';
import { radioMatthiasStructuredFeel } from './ambientRadioMatthiasProfiles.js';
import { installRadioMatthiasRecompositions } from './ambientRadioMatthiasRecompositions.js';

const RADIO_MATTHIAS_HIDDEN_THEME_IDS = new Set([...CURATED_HIDDEN_THEME_IDS, 'blackArchive']);

installRadioMatthiasExpansion({
  themes: AMBIENT_THEMES,
  options: AMBIENT_THEME_OPTIONS,
  groups: AMBIENT_THEME_GROUPS,
  genreOrder: AMBIENT_GENRE_ORDER,
  hiddenIds: RADIO_MATTHIAS_HIDDEN_THEME_IDS,
});
installRadioMatthiasRecompositions({ themes: AMBIENT_THEMES, options: AMBIENT_THEME_OPTIONS });

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

const REACTOR_GAMBIT_PROFILE = Object.freeze({
  family: 'synth-metal-reactor-melodic-drive',
  preserveSectionOrder: true,
  harmonyPath: Object.freeze([0, 0, 3, -2, 5]),
  swing: 0.015,
  warmth: 0.62,
  releaseScale: 0.92,
  space: 0.11,
  delayMs: 108,
  leadInstrument: 'guitar2',
  counterInstrument: 'synth',
  chordInstrument: 'pad',
  bassInstrument: 'synthbass',
  chordHoldSteps: 10,
  bassHoldSteps: 2,
  layers: Object.freeze({ lead: true, counter: true, chords: true, bass: true, drums: true, signature: true }),
  mix: Object.freeze({ lead: 0.72, counter: 0.46, bass: 1.02, chord: 0.36 }),
  percussion: Object.freeze({
    period: 16,
    kit: 'legacy',
    punch: 1.26,
    pattern: Object.freeze({ 0:'K', 3:'H', 4:'K', 8:'S', 10:'H', 12:'K', 14:'H' }),
  }),
  signature: Object.freeze({
    instrument: 'synth',
    sections: Object.freeze([1, 2, 4]),
    everyCycles: 2,
    repeatPeriod: 64,
    durationSteps: 3.2,
    volume: 0.24,
    motif: Object.freeze({ 7: 76, 23: 79, 39: 83, 55: 79 }),
  }),
});

const TANGIER_SMOKE_PROFILE = Object.freeze({
  family: 'tangier-clarinet-guitar-afterhours-v2',
  preserveSectionOrder: true,
  harmonyPath: Object.freeze([0, 0, -2, 5, 0, 3, 0]),
  swing: 0.09,
  warmth: 0.82,
  releaseScale: 1.08,
  space: 0.08,
  delayMs: 118,
  leadInstrument: 'clarinet',
  counterInstrument: 'guitar2',
  chordInstrument: 'rhodesWarm',
  bassInstrument: 'uprightBass',
  chordHoldSteps: 12,
  bassHoldSteps: 3.2,
  layers: Object.freeze({ lead: true, counter: true, chords: true, bass: true, drums: true, signature: true }),
  mix: Object.freeze({ lead: 0.72, counter: 0.46, bass: 0.92, chord: 0.48 }),
  percussion: Object.freeze({
    period: 12,
    kit: 'maghreb-hand',
    punch: 0.98,
    pattern: Object.freeze({ 0:'K', 4:'H', 7:'S', 10:'B' }),
  }),
  signature: Object.freeze({
    instrument: 'clarinet',
    sections: Object.freeze([0, 1, 3]),
    everyCycles: 2,
    repeatPeriod: 64,
    durationSteps: 4.6,
    volume: 0.32,
    motif: Object.freeze({ 6: 67, 22: 70, 38: 65, 54: 62 }),
  }),
});

// Facade deliberadamente pequeño: conserva las identidades legacy y
// permite profundizar temas concretos sin volver a engordar el motor WebAudio.
export function structuredFeel(theme) {
  const radioMatthias = radioMatthiasStructuredFeel(theme);
  if (radioMatthias) return radioMatthias;

  const legacy = legacyStructuredFeel(theme);
  if (!legacy) return legacy;
  if (theme?.id === 'reactorGambit') return Object.freeze({ ...legacy, ...REACTOR_GAMBIT_PROFILE });
  if (theme?.id === 'tangierSmoke') return Object.freeze({ ...legacy, ...TANGIER_SMOKE_PROFILE });
  if (!GRANADA_THEME_IDS.has(theme?.id)) return legacy;
  return Object.freeze({
    ...legacy,
    ...GRANADA_MELODIC_PROFILE,
    leadInstrument: 'nylonGuitar',
    counterInstrument: 'qanun',
    drumMode: 'none',
    percussion: Object.freeze({ period: 32, kit: 'none', punch: 0, pattern: Object.freeze({}) }),
  });
}
