import { chroniclesMapForState } from './chronicles/chroniclesMapCatalog.js';
import { chroniclesIsometricScenePlan } from './chronicles/chroniclesIsometricScenePlan.js';

export function chroniclesEnemyEffectiveVisualScale(baseScale = 1, visualScale = 1) {
  const base = Number(baseScale);
  const authored = Number(visualScale);
  const safeBase = Number.isFinite(base) && base > 0 ? base : 1;
  const safeAuthored = Number.isFinite(authored) && authored > 0 ? authored : 1;
  return safeBase * safeAuthored;
}

export function chroniclesEnemyRenderRoster(state = null) {
  const map = chroniclesMapForState(state);
  const visualById = new Map(
    chroniclesIsometricScenePlan(map).enemies.map((entry) => [entry.id, entry]),
  );

  return Object.freeze(map.enemies.map((definition) => {
    const visual = visualById.get(definition.id);
    return Object.freeze({
      id: definition.id,
      definition,
      visualType: visual?.visualType || definition.visualType || definition.id,
      visualScale: Number.isFinite(Number(visual?.visualScale)) ? Number(visual.visualScale) : 1,
      visualMotion: visual?.visualMotion || 'grounded',
    });
  }));
}
