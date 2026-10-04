import { describe, expect, it } from 'vitest';
import { buildChroniclesEnemyVisual, chroniclesEnemyVisualSpec } from './chroniclesEnemyVisualRegistry.js';

describe('Chronicles enemy visual registry', () => {
  it('preserves the historical renderer scales behind visual types', () => {
    expect(chroniclesEnemyVisualSpec('corrupted-pawn')).toEqual({ visualType: 'corrupted-pawn', scale: 0.92 });
    expect(chroniclesEnemyVisualSpec('gate-jailer')).toEqual({ visualType: 'gate-jailer', scale: 1.04 });
    expect(chroniclesEnemyVisualSpec('spectral-bishop')).toEqual({ visualType: 'spectral-bishop', scale: 0.9 });
    expect(chroniclesEnemyVisualSpec('scavenger-knight')).toEqual({ visualType: 'scavenger-knight', scale: 0.96 });
    expect(chroniclesEnemyVisualSpec('fork-stalker')).toEqual({ visualType: 'fork-stalker', scale: 1.02 });
  });

  it('builds the Fork Stalker with its authored silhouette parts', () => {
    const visual = buildChroniclesEnemyVisual('fork-stalker', { reducedMotion: true });

    expect(visual?.model?.name).toBe('chronicles-fork-stalker');
    expect(visual?.model?.getObjectByName('fork-stalker-fork-crown')).toBeTruthy();
    expect(visual?.model?.getObjectByName('fork-stalker-blade-left')).toBeTruthy();
    expect(visual?.model?.getObjectByName('fork-stalker-blade-right')).toBeTruthy();
  });

  it('returns null for an unregistered visual type instead of silently inventing art', () => {
    expect(chroniclesEnemyVisualSpec('definitely-not-a-creature')).toBeNull();
  });
});
