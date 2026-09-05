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
import { installTropicalHouseMelodies } from './ambientTropicalHouseMelody.js';
import { installRadioPremiumForms } from './ambientRadioPremiumForms.js';
import { withRadioMatthiasLeitmotif } from './ambientRadioMatthiasLeitmotifs.js';

const RADIO_MATTHIAS_HIDDEN_THEME_IDS = new Set([...CURATED_HIDDEN_THEME_IDS, 'blackArchive']);

installRadioMatthiasExpansion({
  themes: AMBIENT_THEMES,
  options: AMBIENT_THEME_OPTIONS,
  groups: AMBIENT_THEME_GROUPS,
  genreOrder: AMBIENT_GENRE_ORDER,
  hiddenIds: RADIO_MATTHIAS_HIDDEN_THEME_IDS,
});
installRadioMatthiasRecompositions({ themes: AMBIENT_THEMES, options: AMBIENT_THEME_OPTIONS });
installTropicalHouseMelodies({ themes: AMBIENT_THEMES, options: AMBIENT_THEME_OPTIONS });
installRadioPremiumForms({ themes: AMBIENT_THEMES, options: AMBIENT_THEME_OPTIONS });

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

// Tropical House tiene que sonar a house antes que a postal de resort: bombo
// a negras, hat en contratiempo, bajo corto y acordes con ataque. El tempo ya
// estaba en la zona correcta; el problema era que el arreglo llevaba el freno
// de mano puesto. Este overlay conserva melodías, armonías y leitmotivs propios.
const TROPICAL_HOUSE_GROOVE = Object.freeze({
  0:'K', 2:'H', 4:'K', 6:'H', 8:'K', 10:'H', 12:'K', 14:'H',
});

const TROPICAL_HOUSE_DRIVE = Object.freeze({
  palmsAtDusk: Object.freeze({
    swing: 0.025, releaseScale: 0.82, space: 0.055, delayMs: 84,
    chordHoldSteps: 6, bassHoldSteps: 2.0, punch: 1.18,
    mix: Object.freeze({ lead: 0.62, counter: 0.42, bass: 1.08, chord: 0.60 }),
  }),
  islandKnight: Object.freeze({
    swing: 0.04, releaseScale: 0.80, space: 0.06, delayMs: 88,
    chordHoldSteps: 6, bassHoldSteps: 1.8, punch: 1.22,
    mix: Object.freeze({ lead: 0.64, counter: 0.38, bass: 1.12, chord: 0.58 }),
  }),
  bishopSunset: Object.freeze({
    swing: 0.03, releaseScale: 0.82, space: 0.055, delayMs: 86,
    chordHoldSteps: 6, bassHoldSteps: 1.9, punch: 1.20,
    mix: Object.freeze({ lead: 0.70, counter: 0.44, bass: 1.10, chord: 0.62 }),
  }),
});

function withTropicalHouseDrive(theme, feel) {
  const drive = TROPICAL_HOUSE_DRIVE[theme?.id];
  if (!drive || !feel) return feel;

  return Object.freeze({
    ...feel,
    swing: drive.swing,
    releaseScale: drive.releaseScale,
    space: drive.space,
    delayMs: drive.delayMs,
    chordHoldSteps: drive.chordHoldSteps,
    bassHoldSteps: drive.bassHoldSteps,
    mix: Object.freeze({ ...(feel.mix || {}), ...drive.mix }),
    percussion: Object.freeze({
      period: 16,
      kit: 'tropical-house-sidechain',
      punch: drive.punch,
      pattern: TROPICAL_HOUSE_GROOVE,
    }),
  });
}

// Facade deliberadamente pequeño: conserva las identidades legacy y
// permite profundizar temas concretos sin volver a engordar el motor WebAudio.
export function structuredFeel(theme) {
  const radioMatthias = radioMatthiasStructuredFeel(theme);
  if (radioMatthias) {
    return withTropicalHouseDrive(theme, withRadioMatthiasLeitmotif(theme, radioMatthias));
  }

  const legacy = legacyStructuredFeel(theme);
  if (!legacy) return legacy;
  if (TROPICAL_HOUSE_DRIVE[theme?.id]) return withTropicalHouseDrive(theme, legacy);
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
