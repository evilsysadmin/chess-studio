import { chroniclesMapRenderPlan } from './chronicles/chroniclesMapCatalog.js';

export function chroniclesIsoDungeonPlan(state = null) {
  const plan = chroniclesMapRenderPlan(state);
  return Object.freeze({
    mapId: plan.mapId,
    grid: plan.grid,
    width: plan.width,
    height: plan.height,
    sigil: plan.sigil,
    lever: plan.lever,
    pickup: plan.pickup,
  });
}
