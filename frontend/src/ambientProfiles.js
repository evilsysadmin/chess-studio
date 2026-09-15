import { structuredFeel as legacyStructuredFeel } from './ambientProfileBase.js';
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
import { installLofiSongbook } from './ambientLofiSongbook.js';
import { installRadioPremiumForms } from './ambientRadioPremiumForms.js';
import { withRadioMatthiasLeitmotif } from './ambientRadioMatthiasLeitmotifs.js';
import { withAmbientPremiumProduction } from './ambientPremiumProduction.js';
import { withRockProduction } from './ambientRockProduction.js';
import { withAmbientIdentityContrast } from './ambientIdentityContrasts.js';
import { withAmbientGenreHook } from './ambientGenreHooks.js';
import { withElectronicProduction } from './ambientElectronicProduction.js';
import { withEnergyProduction } from './ambientEnergyProduction.js';
import { withContemplativeProduction } from './ambientContemplativeProduction.js';
import { withClassicalProduction } from './ambientClassicalProduction.js';
import { withFinalCatalogPolish } from './ambientCatalogFinalPolish.js';

const RADIO_MATTHIAS_HIDDEN_THEME_IDS = new Set([...CURATED_HIDDEN_THEME_IDS, 'blackArchive']);

installRadioMatthiasExpansion({
  themes: AMBIENT_THEMES,
  options: AMBIENT_THEME_OPTIONS,
  groups: AMBIENT_THEME_GROUPS,
  genreOrder: AMBIENT_GENRE_ORDER,
  hiddenIds: RADIO_MATTHIAS_HIDDEN_THEME_IDS,
});
installRadioMatthiasRecompositions({ themes: AMBIENT_THEMES, options: AMBIENT_THEME_OPTIONS });
installLofiSongbook({ themes: AMBIENT_THEMES, options: AMBIENT_THEME_OPTIONS });
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
    motif: Object.freeze({ 6: 64, 30: 68, 54: 63, 62: 61 }),
  }),
});

// Copper Rain is a slow conversation between nylon guitar, clarinet and cello.
// Sharing the Patio's qanun, pizzicato bass and exact guitar signature made
// two otherwise different scores converge on the same audible palette.
const GRANADA_COPPER_PROFILE = Object.freeze({
  ...GRANADA_MELODIC_PROFILE,
  family: 'granada-guitar-clarinet-rain-chamber',
  harmonyPath: Object.freeze([0, 0, -2, 0, 3, 0]),
  warmth: 0.88,
  releaseScale: 1.34,
  space: 0.26,
  delayMs: 310,
  chordHoldSteps: 24,
  bassHoldSteps: 7,
  mix: Object.freeze({ lead: 0.54, counter: 0.30, bass: 0.36, chord: 0.28 }),
  signature: Object.freeze({
    instrument: 'clarinet',
    sections: Object.freeze([0, 3]),
    everyCycles: 2,
    repeatPeriod: 56,
    durationSteps: 7,
    volume: 0.20,
    motif: Object.freeze({ 8: 67, 22: 71, 36: 69, 50: 64 }),
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

const TROPICAL_HOUSE_DRIVE = Object.freeze({
  palmsAtDusk: Object.freeze({
    swing: 0.022, releaseScale: 0.78, space: 0.052, delayMs: 78,
    chordHoldSteps: 2.6, bassHoldSteps: 1.55, punch: 1.20,
    leadInstrument: 'housePiano', counterInstrument: 'nylonGuitar', chordInstrument: 'housePiano',
    kit: 'tropical-sunset-pump', sidechainDepth: 0.60, sidechainReleaseMs: 182,
    pattern: Object.freeze({ 0:'K', 2:'H', 3:'B', 4:'A', 6:'H', 7:'B', 8:'K', 10:'H', 12:'A', 14:'H', 15:'B' }),
    signature: Object.freeze({ instrument:'vocalAir', sections:Object.freeze([0,1]), everyCycles:2, repeatPeriod:64, durationSteps:4.2, volume:0.16, motif:Object.freeze({ 7:76, 23:79, 39:74, 55:72 }) }),
    mix: Object.freeze({ lead: 0.66, counter: 0.34, bass: 1.12, chord: 0.66 }),
  }),
  islandKnight: Object.freeze({
    swing: 0.036, releaseScale: 0.76, space: 0.058, delayMs: 92,
    chordHoldSteps: 2.8, bassHoldSteps: 1.45, punch: 1.22,
    leadInstrument: 'tropicalPluck', counterInstrument: 'warmMarimba', chordInstrument: 'widePad',
    kit: 'tropical-island-organic', sidechainDepth: 0.70, sidechainReleaseMs: 148,
    pattern: Object.freeze({ 0:'K', 2:'H', 3:'B', 4:'A', 6:'H', 7:'B', 8:'K', 10:'H', 11:'B', 12:'A', 14:'H', 15:'B' }),
    signature: Object.freeze({ instrument:'vocalAir', sections:Object.freeze([0,2]), everyCycles:2, repeatPeriod:64, durationSteps:3.6, volume:0.15, motif:Object.freeze({ 4:79, 13:83, 36:76, 45:81 }) }),
    mix: Object.freeze({ lead: 0.68, counter: 0.34, bass: 1.14, chord: 0.60 }),
  }),
  bishopSunset: Object.freeze({
    swing: 0.028, releaseScale: 0.78, space: 0.054, delayMs: 82,
    chordHoldSteps: 2.5, bassHoldSteps: 1.6, punch: 1.21,
    leadInstrument: 'nylonGuitar', counterInstrument: 'vocalAir', chordInstrument: 'housePiano',
    kit: 'tropical-bishop-clave', sidechainDepth: 0.64, sidechainReleaseMs: 164,
    pattern: Object.freeze({ 0:'K', 2:'B', 4:'A', 6:'H', 7:'B', 8:'K', 10:'B', 12:'A', 14:'H', 15:'B' }),
    signature: Object.freeze({ instrument:'nylonGuitar', sections:Object.freeze([0,3]), everyCycles:2, repeatPeriod:64, durationSteps:3.0, volume:0.18, motif:Object.freeze({ 5:67, 19:74, 37:71, 53:76 }) }),
    mix: Object.freeze({ lead: 0.70, counter: 0.32, bass: 1.12, chord: 0.64 }),
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
    leadInstrument: drive.leadInstrument,
    counterInstrument: drive.counterInstrument,
    chordInstrument: drive.chordInstrument,
    signature: drive.signature,
    mix: Object.freeze({ ...(feel.mix || {}), ...drive.mix }),
    percussion: Object.freeze({
      period: 16,
      kit: drive.kit,
      punch: drive.punch,
      sidechainDepth: drive.sidechainDepth,
      sidechainReleaseMs: drive.sidechainReleaseMs,
      pattern: drive.pattern,
    }),
  });
}

// Facade deliberadamente pequeño: conserva las identidades legacy y
// permite profundizar temas concretos sin volver a engordar el motor WebAudio.
export function structuredFeel(theme) {
  const radioMatthias = radioMatthiasStructuredFeel(theme);
  if (radioMatthias) {
    const leitmotif = withRadioMatthiasLeitmotif(theme, radioMatthias);
    const contrasted = withElectronicProduction(theme, withAmbientIdentityContrast(theme, leitmotif));
    const arranged = withTropicalHouseDrive(theme, contrasted);
    const produced = withFinalCatalogPolish(theme, withClassicalProduction(theme, withContemplativeProduction(theme, withEnergyProduction(theme, arranged))));
    return withAmbientPremiumProduction(theme, withAmbientGenreHook(theme, produced));
  }

  const legacy = legacyStructuredFeel(theme);
  if (!legacy) {
    const rescued = withFinalCatalogPolish(theme, legacy);
    return rescued ? withAmbientPremiumProduction(theme, rescued) : legacy;
  }

  let arranged = withElectronicProduction(theme, withAmbientIdentityContrast(theme, legacy));
  if (TROPICAL_HOUSE_DRIVE[theme?.id]) arranged = withTropicalHouseDrive(theme, arranged);
  else if (theme?.id === 'postRockMidnight' || theme?.id === 'rookGarage' || theme?.id === 'desertDriveRock') arranged = withRockProduction(theme, arranged);
  else if (theme?.id === 'reactorGambit') arranged = Object.freeze({ ...arranged, ...REACTOR_GAMBIT_PROFILE });
  else if (theme?.id === 'tangierSmoke') arranged = Object.freeze({ ...arranged, ...TANGIER_SMOKE_PROFILE });
  else if (GRANADA_THEME_IDS.has(theme?.id)) {
    const copperRain = theme.id === 'granadaCopperRain0232';
    arranged = Object.freeze({
      ...arranged,
      ...(copperRain ? GRANADA_COPPER_PROFILE : GRANADA_MELODIC_PROFILE),
      leadInstrument: 'nylonGuitar',
      counterInstrument: copperRain ? 'clarinet' : 'qanun',
      bassInstrument: copperRain ? 'cello' : 'pizz',
      drumMode: 'none',
      percussion: Object.freeze({ period: 32, kit: 'none', punch: 0, pattern: Object.freeze({}) }),
    });
  }

  if (theme?.id === 'fourSquares') {
    // A short plucked cello answer separates its clock-like motif from the
    // sustained cello in Vertical Rain, without adding beats to minimal piano.
    arranged = Object.freeze({ ...arranged, counterInstrument: 'pizz' });
  }

  const produced = withFinalCatalogPolish(theme, withClassicalProduction(theme, withContemplativeProduction(theme, withEnergyProduction(theme, arranged))));
  return withAmbientPremiumProduction(theme, withAmbientGenreHook(theme, produced));
}
