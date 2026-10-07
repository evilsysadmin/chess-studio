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

  it('builds the four canonical threats with cohesive premium-v3 silhouettes', () => {
    const expectations = [
      ['corrupted-pawn', 'premium-threat-v3', 'corrupted-pawn-head', 'corrupted-pawn-shield'],
      ['gate-jailer', 'premium-threat-v3', 'gate-jailer-crown', 'gate-jailer-portcullis'],
      ['spectral-bishop', 'premium-threat-v3', 'spectral-bishop-head-halo', 'spectral-bishop-crozier'],
      ['scavenger-knight', 'premium-threat-v3', 'scavenger-knight-neck-rig', 'scavenger-knight-sword-blade'],
    ];

    expectations.forEach(([visualType, artTier, primaryPart, signaturePart]) => {
      const visual = buildChroniclesEnemyVisual(visualType, { coarsePointer: false, reducedMotion: true });
      expect(visual?.model?.userData?.chroniclesArtTier, visualType).toBe(artTier);
      expect(visual?.model?.getObjectByName(primaryPart), visualType).toBeTruthy();
      expect(visual?.model?.getObjectByName(signaturePart), visualType).toBeTruthy();
    });
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
