import { describe, expect, it } from 'vitest';
import { AMBIENT_THEMES } from './ambientCatalog.js';
import { structuredFeel } from './ambientProfiles.js';
import { getPercussionHumanizationPreview } from './sound.js';

function spread(values) {
  return Math.max(...values) - Math.min(...values);
}

describe('ambient percussion performance v2', () => {
  it('applies a bounded performance profile to every structured theme with drums', () => {
    for (const theme of Object.values(AMBIENT_THEMES)) {
      if (theme?.engine !== 'structured') continue;
      const feel = structuredFeel(theme);
      if (!feel?.percussion || feel.percussion.kit === 'none') continue;

      const performance = feel.percussion.performance;
      expect(performance, theme.id).toBeTruthy();
      expect(performance.anchorVariance, theme.id).toBeGreaterThanOrEqual(0);
      expect(performance.anchorVariance, theme.id).toBeLessThanOrEqual(0.12);
      expect(performance.secondaryVariance, theme.id).toBeGreaterThan(performance.anchorVariance);
      expect(performance.secondaryVariance, theme.id).toBeLessThanOrEqual(0.32);
      expect(performance.phraseLift, theme.id).toBeGreaterThanOrEqual(0);
      expect(performance.phraseLift, theme.id).toBeLessThanOrEqual(0.18);
      expect(performance.stereoMotion, theme.id).toBeGreaterThanOrEqual(0);
      expect(performance.stereoMotion, theme.id).toBeLessThanOrEqual(0.18);
    }
  });

  it('keeps kick/snare anchors on-grid and more stable than hats', () => {
    const steps = [1, 3, 5, 7, 9, 11, 13, 15];
    const kicks = steps.map((step) => getPercussionHumanizationPreview('beirut0113', step, 'K'));
    const hats = steps.map((step) => getPercussionHumanizationPreview('beirut0113', step, 'H'));

    for (const hit of kicks) {
      expect(hit.delayMs).toBe(0);
      expect(hit.ghost).toBe(false);
      expect(Math.abs(hit.pan)).toBeLessThanOrEqual(0.04);
    }
    for (const hit of hats) {
      expect(hit.delayMs).toBe(0);
      expect(hit.ghost).toBe(false);
    }

    expect(spread(hats.map((hit) => hit.velocity))).toBeGreaterThan(spread(kicks.map((hit) => hit.velocity)));
    expect(spread(hats.map((hit) => hit.tone))).toBeGreaterThan(spread(kicks.map((hit) => hit.tone)));
  });

  it('keeps brush texture deterministic and expressive without duplicate attacks', () => {
    const brushes = Array.from({ length: 64 }, (_, index) => (
      getPercussionHumanizationPreview('malagaLastTram', index + 1, 'B')
    ));
    const repeated = Array.from({ length: 64 }, (_, index) => (
      getPercussionHumanizationPreview('malagaLastTram', index + 1, 'B')
    ));

    expect(brushes).toEqual(repeated);
    expect(brushes.every((hit) => hit.delayMs === 0 && hit.ghost === false)).toBe(true);
    expect(spread(brushes.map((hit) => hit.velocity))).toBeGreaterThan(0);
    expect(spread(brushes.map((hit) => hit.tone))).toBeGreaterThan(0);

    const anchors = Array.from({ length: 64 }, (_, index) => (
      getPercussionHumanizationPreview('malagaLastTram', index, index % 2 === 0 ? 'K' : 'S')
    ));
    expect(anchors.every((hit) => hit.ghost === false && hit.delayMs === 0)).toBe(true);
    expect(spread(brushes.map((hit) => hit.velocity))).toBeGreaterThan(spread(anchors.map((hit) => hit.velocity)));
  });

  it('keeps genre feel instead of normalizing every drum performance', () => {
    const lofi = structuredFeel(AMBIENT_THEMES.lofiRainTape).percussion.performance;
    const energy = structuredFeel(AMBIENT_THEMES.neonSiege).percussion.performance;

    expect(lofi.secondaryVariance).toBeGreaterThan(energy.secondaryVariance);
    expect(lofi.stereoMotion).toBeGreaterThan(energy.stereoMotion);
  });
});
