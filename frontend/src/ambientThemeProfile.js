import { structuredFeel } from './ambientProfiles.js';
import { AMBIENT_THEMES } from './ambientCatalog.js';

export const STRUCTURED_LONG_FORM_MS = 120000;
const ANDALUS_TRACK_DURATION_MS = 240000;

export function structuredMasterTrim(feel) {
  if (!feel) return 1;
  const layers = feel.layers || {};
  const mix = feel.mix || {};
  const enabled = (name) => layers[name] !== false;
  const lead = enabled('lead') ? (mix.lead ?? 1) : 0;
  const counter = enabled('counter') ? (mix.counter ?? 0.4) * 0.72 : 0;
  const chord = enabled('chords') ? (mix.chord ?? 1) * 0.92 : 0;
  const bass = enabled('bass') ? (mix.bass ?? 1) * 0.88 : 0;
  const drums = enabled('drums') && (feel.percussion?.kit || 'legacy') !== 'none'
    ? Math.max(0.18, (feel.percussion?.punch || 1) * 0.58)
    : 0;
  const signature = enabled('signature') && feel.signature ? Math.min(0.34, (feel.signature.volume || 0.3) * 0.55) : 0;
  const energy = Math.max(0.55, lead + counter + chord + bass + drums + signature);
  // Compensación suave, no compresión: arreglos densos bajan algo y los
  // camerísticos/SPA recuperan presencia. La horquilla evita matar la dinámica.
  return Math.max(0.76, Math.min(1.12, Math.sqrt(2.05 / energy)));
}

function structuredPersonalityFingerprint(theme, feel) {
  if (!theme || theme.engine !== 'structured') return null;
  const sections = theme.sections || [];
  let lead = 0; let counter = 0; let chords = 0; let bass = 0; let drums = 0;
  let minNote = Infinity; let maxNote = -Infinity;
  const includeNotes = (values) => {
    Object.values(values || {}).forEach((value) => {
      const notes = Array.isArray(value) ? value : [value];
      notes.forEach((note) => {
        if (!Number.isFinite(Number(note))) return;
        minNote = Math.min(minNote, Number(note));
        maxNote = Math.max(maxNote, Number(note));
      });
    });
  };
  sections.forEach((section) => {
    lead += Object.keys(section.lead || {}).length;
    counter += Object.keys(section.counter || {}).length;
    chords += Object.keys(section.chords || {}).length;
    bass += Object.keys(section.bass || {}).length;
    drums += Object.keys(section.drums || {}).length;
    includeNotes(section.lead); includeNotes(section.counter); includeNotes(section.chords); includeNotes(section.bass);
  });
  const range = Number.isFinite(minNote) && Number.isFinite(maxNote) ? Math.round((maxNote - minNote) * 10) / 10 : 0;
  return [
    feel?.family || 'legacy', theme.stepMs, theme.stepsPerSection || 32, sections.length,
    feel?.leadInstrument || theme.leadInstrument || '-', feel?.counterInstrument || theme.counterInstrument || '-',
    feel?.chordInstrument || theme.chordInstrument || '-', feel?.bassInstrument || theme.bassInstrument || '-',
    feel?.percussion?.kit || 'legacy', lead, counter, chords, bass, drums, range,
  ].join('|');
}

export function getAmbientThemeSoundProfile(themeId) {
  const theme = AMBIENT_THEMES[themeId];
  const feel = structuredFeel(theme);
  if (!theme || theme.engine !== 'structured') return null;
  return feel ? {
    family: feel.family,
    stepMs: theme.stepMs,
    estimatedBpm: Math.round((60000 / (theme.stepMs * 4)) * 10) / 10,
    preserveSectionOrder: !!feel.preserveSectionOrder,
    swing: feel.swing || 0,
    warmth: feel.warmth || 1,
    groovePeriod: feel.percussion?.period || null,
    percussionPeriod: feel.percussion?.period || null,
    percussionKit: feel.percussion?.kit || 'legacy',
    percussionPunch: feel.percussion?.punch || 1,
    sidechainDepth: feel.percussion?.sidechainDepth || null,
    sidechainReleaseMs: feel.percussion?.sidechainReleaseMs || null,
    percussionHumanized: (feel.percussion?.kit || 'legacy') !== 'none',
    percussionMicrotimingMs: (feel.percussion?.kit || 'legacy') === 'none' ? 0 : 12,
    drumMode: feel.drumMode || 'dynamic',
    signatureInstrument: feel.signature?.instrument || null,
    signatureSteps: Object.keys(feel.signature?.motif || {}).length,
    signatureRepeatPeriod: feel.signature?.repeatPeriod || null,
    enabledLayers: Object.entries(feel.layers || {}).filter(([, enabled]) => enabled !== false).map(([name]) => name),
    space: feel.space || 0,
    leadInstrument: feel.leadInstrument || theme.leadInstrument,
    counterInstrument: feel.counterInstrument || theme.counterInstrument || null,
    chordInstrument: feel.chordInstrument || theme.chordInstrument,
    bassInstrument: feel.bassInstrument || theme.bassInstrument,
    masterTrim: Math.round(structuredMasterTrim(feel) * 1000) / 1000,
    personalityFingerprint: structuredPersonalityFingerprint(theme, feel),
  } : {
    family: 'legacy-structured', stepMs: theme.stepMs, estimatedBpm: Math.round((60000 / (theme.stepMs * 4)) * 10) / 10, preserveSectionOrder: false, swing: 0, warmth: 1,
    groovePeriod: null, percussionPeriod: null, percussionKit: 'legacy', percussionPunch: 1,
    percussionHumanized: true, percussionMicrotimingMs: 6,
    leadInstrument: theme.leadInstrument, counterInstrument: theme.counterInstrument || null,
    chordInstrument: theme.chordInstrument, bassInstrument: theme.bassInstrument,
    masterTrim: 1, personalityFingerprint: structuredPersonalityFingerprint(theme, null),
  };
}

export function getAmbientThemeVariationDurationMs(themeId) {
  const theme = AMBIENT_THEMES[themeId];
  if (!theme || theme.engine !== 'structured') return null;
  const sections = Math.max(1, theme.sections?.length || 1);
  const steps = Math.max(1, theme.stepsPerSection || 32);
  const cycleMs = sections * steps * theme.stepMs;
  const span = Math.max(8, Math.ceil((theme.longFormMs || STRUCTURED_LONG_FORM_MS) / cycleMs));
  return cycleMs * span;
}

// Duración de reproducción de una "pista" antes de pasar a otra. Los temas
// estructurados usan su forma larga completa; Al-Ándalus es estocástico y no
// tiene cierre natural, así que le damos una ventana de cuatro minutos.
export function getAmbientTrackDurationMs(themeId) {
  return getAmbientThemeVariationDurationMs(themeId) || ANDALUS_TRACK_DURATION_MS;
}
