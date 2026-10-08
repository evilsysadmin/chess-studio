import {
  chroniclesMapForState,
} from './chroniclesMapCatalog.js';
import { chroniclesIsometricScenePlan } from './chroniclesIsometricScenePlan.js';
import { CHRONICLES_CANONICAL_CRYPT_MAP_ID, chroniclesRegionSceneMetadata } from './chroniclesWorldRegion.js';

export function chroniclesFirstPersonScenePlan(state) {
  const map = chroniclesMapForState(state);
  const spatialPlan = chroniclesIsometricScenePlan(state);
  return Object.freeze({
    ...spatialPlan,
    mapId: map.id,
    grid: map.grid,
    enemies: map.enemies,
    ...chroniclesRegionSceneMetadata(map),
    useAuthoredCryptDressing: map.id === CHRONICLES_CANONICAL_CRYPT_MAP_ID,
  });
}
