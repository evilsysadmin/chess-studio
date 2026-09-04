import { describe, expect, it } from 'vitest';
import { AMBIENT_THEMES } from './ambientCatalog.js';
import { structuredFeel } from './ambientProfiles.js';
import { auditThemeDiversity, highConfidenceThemeClones } from './ambientDiversityAudit.js';

function printablePairs(pairs, limit = 12) {
  return pairs.slice(0, limit).map((pair) => (
    `${pair.left} ↔ ${pair.right} score=${pair.score.toFixed(3)} melody=${pair.melody.toFixed(3)} rhythm=${pair.rhythm.toFixed(3)} harmony=${pair.harmony.toFixed(3)}`
  )).join('\n');
}

describe('Radio Matthias · auditoría global de diversidad', () => {
  it('fingerprinta una porción amplia del catálogo y ordena sospechosos', () => {
    const pairs = auditThemeDiversity(AMBIENT_THEMES, structuredFeel);
    expect(Object.keys(AMBIENT_THEMES).length).toBeGreaterThan(40);
    expect(pairs.length).toBeGreaterThan(500);
    expect(pairs[0]?.score).toBeGreaterThanOrEqual(pairs.at(-1)?.score || 0);
  });

  it('no permite clones melódicos de alta confianza en ninguna familia', () => {
    const pairs = auditThemeDiversity(AMBIENT_THEMES, structuredFeel);
    const clones = highConfidenceThemeClones(pairs);
    expect(
      clones,
      `Radio Matthias conserva clones de alta confianza:\n${printablePairs(clones.length ? clones : pairs)}`,
    ).toEqual([]);
  });
});
