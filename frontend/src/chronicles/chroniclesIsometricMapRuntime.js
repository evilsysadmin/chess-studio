import { chroniclesMapForState } from './chroniclesMapCatalog.js';
import { chroniclesRequirementsMet } from './chroniclesContentRuntime.js';

function mapFrom(mapOrState) {
  return mapOrState?.grid ? mapOrState : chroniclesMapForState(mapOrState);
}

export function chroniclesIsoEntryPosition(mapOrState, entry) {
  const map = mapFrom(mapOrState);
  if (!entry) return null;
  if (Number.isFinite(entry.x) && Number.isFinite(entry.y)) {
    return { x: entry.x, y: entry.y };
  }
  if (!entry.tile) return null;
  for (let y = 0; y < map.grid.length; y += 1) {
    const x = map.grid[y].indexOf(entry.tile);
    if (x >= 0) return { x, y };
  }
  return null;
}

export function chroniclesIsoRenderPlan(mapOrState) {
  const map = mapFrom(mapOrState);
  const lever = map.interactables.find((entry) => entry.kind === 'lever') || null;
  const pickup = map.treasures.find((entry) => entry.kind === 'pickup') || null;
  const sigil = map.triggers.find((entry) => entry.kind === 'trigger') || null;
  return {
    mapId: map.id,
    title: map.title,
    grid: map.grid,
    width: map.grid[0]?.length || 0,
    height: map.grid.length,
    enemies: map.enemies.map((enemy) => ({
      id: enemy.id,
      visualType: enemy.visualType || enemy.id,
    })),
    lever: lever ? { id: lever.id, position: chroniclesIsoEntryPosition(map, lever) } : null,
    pickup: pickup ? { id: pickup.id, position: chroniclesIsoEntryPosition(map, pickup) } : null,
    sigil: sigil ? { id: sigil.id, position: chroniclesIsoEntryPosition(map, sigil) } : null,
  };
}

export function chroniclesIsoWorldObjectState(state, mapOrState = state) {
  const map = mapFrom(mapOrState);
  const lever = map.interactables.find((entry) => entry.kind === 'lever') || null;
  const pickup = map.treasures.find((entry) => entry.kind === 'pickup') || null;
  return {
    leverPulled: lever ? !chroniclesRequirementsMet(state, lever.when) : false,
    pickupVisible: pickup ? chroniclesRequirementsMet(state, pickup.when) : false,
  };
}
