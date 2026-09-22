import { structuredFeel } from './ambientProfiles.js';
import { STRUCTURED_LONG_FORM_MS, structuredMasterTrim } from './ambientThemeProfile.js';

const STRUCTURED_HARMONY_PATH = [0, 0, 5, 5, 0, -2, -2, 0, 7, 7, 3, 0];

export function stableThemeSeed(id = '') {
  let seed = 0;
  for (let i = 0; i < id.length; i += 1) seed = ((seed * 31) + id.charCodeAt(i)) >>> 0;
  return seed;
}

export function structuredArrangement(theme, cycleIndex) {
  const sections = Math.max(1, theme.sections?.length || 1);
  const stepsPerSection = Math.max(1, theme.stepsPerSection || 32);
  const cycleMs = Math.max(1, sections * stepsPerSection * theme.stepMs);
  const span = Math.max(8, Math.ceil((theme.longFormMs || STRUCTURED_LONG_FORM_MS) / cycleMs));
  const phase = cycleIndex % span;
  const seed = stableThemeSeed(theme.id);
  const feel = structuredFeel(theme);
  const harmonyPath = feel?.harmonyPath || STRUCTURED_HARMONY_PATH;
  const harmonicIndex = Math.floor((phase / span) * harmonyPath.length);
  // Las escenas nuevas priorizan continuidad tonal: empiezan siempre en su
  // centro escrito y modulan sólo siguiendo su propia ruta. Los temas legacy
  // conservan el offset histórico derivado de la seed.
  const pathOffset = feel ? 0 : (seed % 3);
  const transpose = harmonyPath[(harmonicIndex + pathOffset) % harmonyPath.length];
  const texture = (phase + (seed % 7)) % 9;

  const masterTrim = structuredMasterTrim(feel);

  return {
    span,
    transpose,
    feel,
    masterTrim,
    // Cambios de registro puntuales, no una octava arriba cada dos vueltas.
    leadOctave: texture === 3 ? 12 : texture === 7 ? -12 : 0,
    leadVolume: (texture === 1 ? 0.72 : texture === 6 ? 0.86 : 1) * (feel?.mix?.lead || 1) * masterTrim,
    bassVolume: (texture === 4 ? 0.68 : 0.9) * (feel?.mix?.bass || 1) * masterTrim,
    chordVolume: (texture === 5 ? 0.72 : 1) * (feel?.mix?.chord || 1) * masterTrim,
    counterVolume: (texture === 3 ? 0.34 : texture === 7 ? 0.46 : (feel?.counterGainScale || 0.4)) * (feel?.mix?.counter || 1) * masterTrim,
    counterOctave: texture === 6 ? -12 : 0,
    // Unas vueltas dejan respirar la melodía o la batería. La forma base
    // sigue reconocible, pero no tenemos la misma pared de sonido cada 4 s.
    leadMode: feel
      ? (texture === 8 ? 'sparse' : 'full')
      : (texture === 2 ? 'late' : texture === 8 ? 'sparse' : 'full'),
    drumMode: feel?.drumMode || (feel
      ? (texture === 6 ? 'sparse' : 'full')
      : (texture === 0 ? 'full' : texture === 4 ? 'sparse' : texture === 6 ? 'none' : 'full')),
    sectionShift: feel?.preserveSectionOrder ? 0 : (sections > 1 ? Math.floor(phase / 2 + (seed % sections)) % sections : 0),
  };
}

export function shouldPlayStructuredDrum(mode, code) {
  if (mode === 'none') return false;
  // En las vueltas con menos batería quitamos sobre todo hats/ornamentos,
  // pero conservamos los golpes que definen el pulso. Antes se filtraba por
  // el número absoluto de step y eso podía destruir una métrica 6/8 o 7/8.
  if (mode === 'sparse') return code !== 'H';
  return true;
}

export function structuredPercussionPatternStep(globalStep, period) {
  const safePeriod = Math.max(1, Math.floor(Number(period) || 1));
  return ((Math.floor(Number(globalStep) || 0) % safePeriod) + safePeriod) % safePeriod;
}

export function structuredDrumAtStep(section, feel, localStep, globalStep = localStep) {
  if (!feel?.percussion) return section.drums?.[localStep] || null;
  const { period, pattern } = feel.percussion;
  if (!period || !pattern) return null;
  // El groove continúa entre secciones aunque stepsPerSection no sea múltiplo
  // del patrón. Reiniciarlo en cada sección desplazaba Beirut, Estambul y
  // otras métricas respecto a bajo/melodía.
  return pattern[structuredPercussionPatternStep(globalStep, period)] || null;
}

export function structuredSignatureAtStep(feel, localStep, sectionIndex, cycleIndex) {
  const signature = feel?.signature;
  if (!signature?.motif) return null;
  if (Array.isArray(signature.sections) && !signature.sections.includes(sectionIndex)) return null;
  const every = Math.max(1, signature.everyCycles || 1);
  if (cycleIndex % every !== 0) return null;
  const motifStep = signature.repeatPeriod ? (localStep % signature.repeatPeriod) : localStep;
  const note = signature.motif[motifStep];
  return note == null ? null : { ...signature, note };
}
