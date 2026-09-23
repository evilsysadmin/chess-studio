import { chroniclesMapForState } from './chroniclesMapCatalog.js';

export function chroniclesFirstPersonScenePlan(state) {
  const map = chroniclesMapForState(state);
  return Object.freeze({
    mapId: map.id,
    grid: map.grid,
    enemies: map.enemies,
  });
}
