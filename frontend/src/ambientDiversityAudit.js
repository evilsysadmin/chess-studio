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
  return notes.slice(1).map((note, index) => {
    const delta = note - notes[index];
    if (delta > 12) return 12;
    if (delta < -12) return -12;
    return delta;
  });
}

function harmonySignature(theme, feel) {
  const path = feel?.harmonyPath || theme?.keyCenters || [];
  const clean = path.map(Number).filter(Number.isFinite);
  if (clean.length < 2) return clean;
  return clean.slice(1).map((value, index) => value - clean[index]);
}

export function themeDiversityFingerprint(theme, feel) {
  const structured = Boolean(theme?.sections?.some((section) => Object.keys(section?.lead || {}).length));
  const melodic = structured ? orderedStructuredLead(theme) : orderedLegacyLead(theme);
  const intervals = normalizedIntervals(melodic.notes);
  const harmony = harmonySignature(theme, feel);

  return Object.freeze({
    id: theme?.id || '',
    engine: structured ? 'structured' : 'legacy',
    noteCount: melodic.notes.length,
    intervalBigrams: grams(intervals, 2),
    intervalTrigrams: grams(intervals, 3),
    rhythmBigrams: grams(melodic.gaps, 2),
    harmonyBigrams: grams(harmony, 2),
  });
}

export function compareThemeFingerprints(left, right) {
  const melodicBigram = jaccard(left.intervalBigrams, right.intervalBigrams);
  const melodicTrigram = jaccard(left.intervalTrigrams, right.intervalTrigrams);
  const rhythm = jaccard(left.rhythmBigrams, right.rhythmBigrams);
  const harmony = jaccard(left.harmonyBigrams, right.harmonyBigrams);
  const melody = (melodicBigram * 0.45) + (melodicTrigram * 0.55);
  const score = (melody * 0.6) + (rhythm * 0.2) + (harmony * 0.2);

  return Object.freeze({
    score,
    melody,
    rhythm,
    harmony,
  });
}

export function auditThemeDiversity(themes, feelResolver = () => null) {
  const fingerprints = Object.values(themes || {})
    .map((theme) => themeDiversityFingerprint(theme, feelResolver(theme)))
    .filter((fingerprint) => fingerprint.noteCount >= 6 && fingerprint.intervalBigrams.size >= 2);

  const pairs = [];
  for (let left = 0; left < fingerprints.length; left += 1) {
    for (let right = left + 1; right < fingerprints.length; right += 1) {
      const comparison = compareThemeFingerprints(fingerprints[left], fingerprints[right]);
      pairs.push(Object.freeze({
        left: fingerprints[left].id,
        right: fingerprints[right].id,
        leftEngine: fingerprints[left].engine,
        rightEngine: fingerprints[right].engine,
        ...comparison,
      }));
    }
  }

  return pairs.sort((left, right) => right.score - left.score);
}

export function highConfidenceThemeClones(pairs, threshold = 0.78) {
  return (pairs || []).filter((pair) => (
    pair.score >= threshold
    && pair.melody >= 0.68
    && (pair.rhythm >= 0.5 || pair.harmony >= 0.5)
  ));
}
