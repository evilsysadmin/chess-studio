import {
  chroniclesMapForState,
  chroniclesMapRenderPlan,
} from './chroniclesMapCatalog.js';
import {
  chroniclesContentDefinition,
  chroniclesContentVisible,
} from './chroniclesContentRuntime.js';

function mapCenter(grid) {
  const height = grid.length;
  const width = grid[0]?.length || 0;
  return Object.freeze({
    x: Math.max(0, (width - 1) / 2),
    y: Math.max(0, (height - 1) / 2),
  });
}

function visibleFloorCells(grid) {
  return Object.freeze(grid.flatMap((row, y) => [...row].flatMap((tile, x) => (
    tile === '#'
      ? []
      : [Object.freeze({ x, y, tile })]
  ))));
}

function visibleWallCells(grid) {
  const height = grid.length;
  const width = grid[0]?.length || 0;
  const walkable = (x, y) => Boolean(grid[y]?.[x] && grid[y][x] !== '#');
  return Object.freeze(grid.flatMap((row, y) => [...row].flatMap((tile, x) => {
    if (tile !== '#') return [];
    if (x === width - 1 || y === height - 1) return [];
    const touchesWalkable = walkable(x - 1, y)
      || walkable(x + 1, y)
      || walkable(x, y - 1)
      || walkable(x, y + 1);
    return touchesWalkable ? [Object.freeze({ x, y })] : [];
  })));
}

export function chroniclesIsometricScenePlan(mapOrState = null) {
  const runtimeState = mapOrState?.grid ? null : mapOrState;
  const map = mapOrState?.grid ? mapOrState : chroniclesMapForState(mapOrState);
  const renderPlan = chroniclesMapRenderPlan(map);
  const center = mapCenter(renderPlan.grid);
  const partyStart = Object.freeze({
    x: Number(map.partyStart?.x ?? center.x),
    y: Number(map.partyStart?.y ?? center.y),
  });
  const content = Object.freeze(renderPlan.content.map((entry) => Object.freeze({
    ...entry,
    visible: chroniclesContentVisible(
      runtimeState,
      chroniclesContentDefinition(map, entry.id),
    ),
  })));

  return Object.freeze({
    mapId: renderPlan.mapId,
    title: renderPlan.title,
    width: renderPlan.width,
    height: renderPlan.height,
    center,
    partyStart,
    floors: visibleFloorCells(renderPlan.grid),
    walls: visibleWallCells(renderPlan.grid),
    enemies: renderPlan.enemies,
    content,
  });
}
