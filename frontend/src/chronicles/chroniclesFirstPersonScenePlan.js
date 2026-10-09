import {
  chroniclesMapForState,
} from './chroniclesMapCatalog.js';
import { chroniclesIsometricScenePlan } from './chroniclesIsometricScenePlan.js';

export function chroniclesFirstPersonScenePlan(state) {
  const map = chroniclesMapForState(state);
  const spatialPlan = chroniclesIsometricScenePlan(state);
  return Object.freeze({
    ...spatialPlan,
    mapId: map.id,
    grid: map.grid,
    enemies: map.enemies,
    regionKind: map.regionKind || 'dungeon',
    useAuthoredCryptDressing: map.id === 'crypt-eight-squares',
  });
}
