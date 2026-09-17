import { describe, expect, it } from 'vitest';
import {
  buildChroniclesEnemyVisual,
  chroniclesEnemyVisualSpec,
} from '../chroniclesEnemyVisualRegistry.js';
import { chroniclesMapById, chroniclesMapIds } from './chroniclesMapCatalog.js';

function disposeModel(model) {
  model?.traverse?.((node) => {
    node.geometry?.dispose?.();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.filter(Boolean).forEach((material) => material.dispose?.());
  });
}

describe('Chronicles authored enemy visual coverage', () => {
  it('has a renderable visual registered for every enemy authored in every map', () => {
    const visualTypes = new Set(
      chroniclesMapIds().flatMap((mapId) => (
        chroniclesMapById(mapId).enemies.map((enemy) => enemy.visualType)
      )),
    );

    visualTypes.forEach((visualType) => {
      expect(chroniclesEnemyVisualSpec(visualType), visualType).toBeTruthy();
      const built = buildChroniclesEnemyVisual(visualType, { coarsePointer: true, reducedMotion: true });
      expect(built?.model, visualType).toBeTruthy();
      expect(built.model.children.length, visualType).toBeGreaterThan(0);
      disposeModel(built.model);
    });
  });

  it('gives the Menagerie four distinct fantasy silhouettes instead of chess-piece fallbacks', () => {
    const expected = {
      'ash-goblin': 'squat-eared-cleaver',
      'crypt-spider': 'low-eight-legged-hunter',
      'ember-wisp': 'floating-ember-flame',
      'bone-hound': 'skeletal-ribbed-hound',
    };

    Object.entries(expected).forEach(([visualType, silhouette]) => {
      const built = buildChroniclesEnemyVisual(visualType, { coarsePointer: true, reducedMotion: true });
      expect(built.model.userData.chroniclesSilhouette).toBe(silhouette);
      expect(built.model.userData.chroniclesArtTier).toBe('fantasy-bestiary-v1');
      disposeModel(built.model);
    });
  });
});
