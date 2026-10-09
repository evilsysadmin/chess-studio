import {
  chroniclesMapForState,
} from './chroniclesMapCatalog.js';
import { chroniclesIsometricScenePlan } from './chroniclesIsometricScenePlan.js';
import { chroniclesSwordhavenReturnVisual } from './chroniclesSwordhavenReturnPortal.js';

export function chroniclesFirstPersonScenePlan(state) {
  const map = chroniclesMapForState(state);
  const spatialPlan = chroniclesIsometricScenePlan(state);
  return Object.freeze({
    ...spatialPlan,
    mapId: map.id,
    grid: map.grid,
    enemies: map.enemies,
    content: Object.freeze([
      ...(spatialPlan.content || []),
      ...chroniclesSwordhavenReturnVisual(state),
    ]),
    regionKind: map.regionKind || 'dungeon',
    useAuthoredCryptDressing: map.id === 'crypt-eight-squares',
  });
}
