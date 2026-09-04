import { describe, expect, it } from 'vitest';
import { AMBIENT_THEMES } from './ambientCatalog.js';
import { structuredFeel } from './ambientProfiles.js';

function orderedStructuredLead(theme) {
  const notes = [];
  const gaps = [];
  for (const section of theme?.sections || []) {
    const entries = Object.entries(section?.lead || {})
      .map(([step, note]) => [Number(step), Number(note)])
      .filter(([step, note]) => Number.isFinite(step) && Number.isFinite(note))
      .sort(([left], [right]) => left - right);
    for (let index = 0; index < entries.length; index += 1) {
      notes.push(entries[index][1]);
      if (index > 0) gaps.push(entries[index][0] - entries[index - 1][0]);
    }
  }
  return { notes, gaps };
}

function orderedLegacyLead(theme) {
  const notes = [];
  const gaps = [];
  for (const phrase of theme?.phrases || []) {
    const clean = (phrase || []).map(Number).filter(Number.isFinite);
    notes.push(...clean);
    if (clean.length > 1) gaps.push(clean.length);
  }
  return { notes, gaps };
}

function grams(values, width = 2) {
  const result = new Set();
  for (let index = 0; index <= values.length - width; index += 1) {
    result.add(values.slice(index, index + width).join(','));
  }
  return result;
}

function jaccard(left, right) {
  if (!left.size && !right.size) return 0;
  let intersection = 0;
  for (const item of left) if (right.has(item)) intersection += 1;
  const union = new Set([...left, ...right]).size;
  return union ? intersection / union : 0;
}

function normalizedIntervals(notes) {
  if (notes.length < 2) return [];
  return notes.slice(1).map((note, index) => Math.max(-12, Math.min(12, note - notes[index])));
}

function fingerprint(theme) {
  const structured = Boolean(theme?.sections?.some((section) => Object.keys(section?.lead || {}).length));
  const melodic = structured ? orderedStructuredLead(theme) : orderedLegacyLead(theme);
  const intervals = normalizedIntervals(melodic.notes);
  const feel = structuredFeel(theme);
  const path = (feel?.harmonyPath || theme?.keyCenters || []).map(Number).filter(Number.isFinite);
  const harmony = path.slice(1).map((value, index) => value - path[index]);
  return {
    id: theme.id,
    noteCount: melodic.notes.length,
    intervalBigrams: grams(intervals, 2),
    intervalTrigrams: grams(intervals, 3),
    rhythmBigrams: grams(melodic.gaps, 2),
    harmonyBigrams: grams(harmony, 2),
  };
}

function auditThemeDiversity() {
  const fingerprints = Object.values(AMBIENT_THEMES)
    .map(fingerprint)
    .filter((item) => item.noteCount >= 6 && item.intervalBigrams.size >= 2);
  const pairs = [];
  for (let left = 0; left < fingerprints.length; left += 1) {
    for (let right = left + 1; right < fingerprints.length; right += 1) {
      const a = fingerprints[left];
      const b = fingerprints[right];
      const melody = (jaccard(a.intervalBigrams, b.intervalBigrams) * 0.45)
        + (jaccard(a.intervalTrigrams, b.intervalTrigrams) * 0.55);
      const rhythm = jaccard(a.rhythmBigrams, b.rhythmBigrams);
      const harmony = jaccard(a.harmonyBigrams, b.harmonyBigrams);
      const score = (melody * 0.6) + (rhythm * 0.2) + (harmony * 0.2);
      pairs.push({ left: a.id, right: b.id, score, melody, rhythm, harmony });
    }
  }
  return pairs.sort((left, right) => right.score - left.score);
}

function highConfidenceThemeClones(pairs, threshold = 0.78) {
  return pairs.filter((pair) => (
    pair.score >= threshold
    && pair.melody >= 0.68
    && (pair.rhythm >= 0.5 || pair.harmony >= 0.5)
  ));
}

function printablePairs(pairs, limit = 12) {
  return pairs.slice(0, limit).map((pair) => (
    `${pair.left} ↔ ${pair.right} score=${pair.score.toFixed(3)} melody=${pair.melody.toFixed(3)} rhythm=${pair.rhythm.toFixed(3)} harmony=${pair.harmony.toFixed(3)}`
  )).join('\n');
}

describe('Radio Matthias · auditoría global de diversidad', () => {
  it('fingerprinta una porción amplia del catálogo y ordena sospechosos', () => {
    const pairs = auditThemeDiversity();
    expect(Object.keys(AMBIENT_THEMES).length).toBeGreaterThan(40);
    expect(pairs.length).toBeGreaterThan(500);
    expect(pairs[0]?.score).toBeGreaterThanOrEqual(pairs.at(-1)?.score || 0);
  });

  it('no permite clones melódicos de alta confianza en ninguna familia', () => {
    const pairs = auditThemeDiversity();
    const clones = highConfidenceThemeClones(pairs);
    expect(
      clones,
      `Radio Matthias conserva clones de alta confianza:\n${printablePairs(clones.length ? clones : pairs)}`,
    ).toEqual([]);
  });
});
