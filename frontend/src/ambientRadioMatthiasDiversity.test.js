import { describe, expect, it } from 'vitest';
import { AMBIENT_THEMES } from './ambientCatalog.js';
import { structuredFeel } from './ambientProfiles.js';
import { RADIO_MATTHIAS_MELODIC_REWRITES } from './ambientRadioMatthiasRecompositions.js';
import { RADIO_PREMIUM_FORM_SPECS } from './ambientRadioPremiumForms.js';

// This regression gate belongs to the seven-theme recomposition shipped in #345.
// The premium-form layer may thin, shift or octave-displace that material, but it
// must keep the published identity and the melodic DNA of the recomposition.
const ORIGINAL_REWRITE_IDS = Object.freeze([
  'velvetKnight0237',
  'bishopSunset',
  'checkEngine',
  'rookAfterHours',
  'lofiPawnNotebook',
  'rookVeranda',
  'bishopCircuit',
]);

function orderedLeadNotes(theme) {
  const lead = theme.sections?.[0]?.lead || {};
  return Object.entries(lead)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, note]) => Number(note));
}

function intervalBigrams(theme) {
  const notes = orderedLeadNotes(theme);
  const intervals = notes.slice(1).map((note, index) => note - notes[index]);
  const grams = new Set();
  for (let index = 0; index < intervals.length - 1; index += 1) {
    grams.add(`${intervals[index]},${intervals[index + 1]}`);
  }
  return grams;
}

function jaccard(left, right) {
  const intersection = [...left].filter((item) => right.has(item)).length;
  const union = new Set([...left, ...right]).size;
  return union ? intersection / union : 0;
}

function pitchClass(note) {
  const value = Number(note);
  return ((value % 12) + 12) % 12;
}

function layerPitchClasses(sections, layer) {
  return new Set((sections || []).flatMap((section) => (
    Object.values(section?.[layer] || {}).flatMap((value) => (
      Array.isArray(value) ? value : [value]
    ))
  )).map(pitchClass));
}

function layerNotes(sections, layer) {
  return (sections || []).flatMap((section) => (
    Object.values(section?.[layer] || {}).flatMap((value) => (
      Array.isArray(value) ? value : [value]
    ))
  )).map(Number).filter(Number.isFinite);
}

describe('Radio Matthias · diversidad melódica', () => {
  it('mantiene las siete recomposiciones como ADN de sus formas premium sin cambiar ids públicos', () => {
    for (const id of ORIGINAL_REWRITE_IDS) {
      const theme = AMBIENT_THEMES[id];
      const rewrite = RADIO_MATTHIAS_MELODIC_REWRITES[id];
      const form = RADIO_PREMIUM_FORM_SPECS[id];

      expect(theme.id).toBe(id);
      expect(theme.description).toBe(rewrite.description);
      expect(theme.premiumFormVersion).toBe(1);
      expect(theme.premiumFormScenes).toEqual(form.map((scene) => scene.name));

      for (const layer of ['lead', 'counter']) {
        const sourcePitchClasses = layerPitchClasses(rewrite.melodySections, layer);
        const arrangedNotes = layerNotes(theme.sections, layer);
        expect(arrangedNotes.length, `${id}.${layer} no puede desaparecer de toda la forma premium`).toBeGreaterThan(0);
        for (const note of arrangedNotes) {
          expect(
            sourcePitchClasses.has(pitchClass(note)),
            `${id}.${layer} inventó la clase de altura ${pitchClass(note)} fuera de su recomposición`,
          ).toBe(true);
        }
      }
    }
  });

  it('da a las siete recomposiciones originales una ruta armónica propia', () => {
    const paths = ORIGINAL_REWRITE_IDS.map((id) => (
      JSON.stringify(structuredFeel(AMBIENT_THEMES[id]).harmonyPath)
    ));
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('evita que las siete originales vuelvan a compartir el mismo esqueleto de intervalos', () => {
    const fingerprints = ORIGINAL_REWRITE_IDS.map((id) => ({
      id,
      grams: intervalBigrams(AMBIENT_THEMES[id]),
    }));

    for (let left = 0; left < fingerprints.length; left += 1) {
      for (let right = left + 1; right < fingerprints.length; right += 1) {
        const similarity = jaccard(fingerprints[left].grams, fingerprints[right].grams);
        expect(
          similarity,
          `${fingerprints[left].id} y ${fingerprints[right].id} comparten demasiado contorno melódico`,
        ).toBeLessThanOrEqual(0.25);
      }
    }
  });
});
