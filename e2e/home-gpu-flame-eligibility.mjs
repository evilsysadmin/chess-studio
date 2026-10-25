// Decode Home's opt-in flame material census without inventing missing values.
// Slots are potential material draws, never observed renderer calls or GPU ms.
const FIELDS = Object.freeze([
  'flameNodes', 'hotNodes', 'candleNodes', 'materialSlots', 'doubleSided',
  'frontSided', 'otherSided', 'transparentNow',
  'transparentDoubleSidedNow', 'singlePassTransparentDoubleSidedNow',
]);

export function parseHomeGpuFlameEligibility(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  let counts;
  try { counts = JSON.parse(raw); }
  catch { return null; }
  if (!counts || Array.isArray(counts) || typeof counts !== 'object'
    || !FIELDS.every((key) => Number.isSafeInteger(counts[key]) && counts[key] >= 0)) return null;
  if (counts.materialSlots !== counts.doubleSided + counts.frontSided + counts.otherSided
    || counts.transparentNow > counts.materialSlots
    || counts.transparentDoubleSidedNow > counts.transparentNow
    || counts.transparentDoubleSidedNow > counts.doubleSided
    || counts.singlePassTransparentDoubleSidedNow > counts.transparentDoubleSidedNow) return null;
  return Object.fromEntries(FIELDS.map((key) => [key, counts[key]]));
}
