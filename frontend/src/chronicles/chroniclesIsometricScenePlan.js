import {
  chroniclesMapForState,
  chroniclesMapRenderPlan,
} from './chroniclesMapCatalog.js';
import {
  chroniclesContentDefinition,
  chroniclesContentVisible,
  chroniclesRequirementsMet,
} from './chroniclesContentRuntime.js';
import { chroniclesIsometricSceneStyle } from './chroniclesIsometricSceneStyles.js';

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

function exposedWallFaces(grid) {
  const directions = [
    { dx: 0, dy: -1, side: 'north' },
    { dx: 1, dy: 0, side: 'east' },
    { dx: 0, dy: 1, side: 'south' },
    { dx: -1, dy: 0, side: 'west' },
  ];
  return Object.freeze(grid.flatMap((row, y) => [...row].flatMap((tile, x) => {
    if (tile !== '#') return [];
    return directions.flatMap((direction) => {
      const neighbor = grid[y + direction.dy]?.[x + direction.dx];
      return neighbor && neighbor !== '#'
        ? [Object.freeze({ x, y, side: direction.side })]
        : [];
    });
  })));
}

function contentPlan(runtimeState, map, renderPlan) {
  return Object.freeze(renderPlan.content.map((entry) => {
    const definition = chroniclesContentDefinition(map, entry.id);
    const activeWhen = definition?.visual?.activeWhen;
    return Object.freeze({
      ...entry,
      visible: chroniclesContentVisible(runtimeState, definition),
      active: Boolean(
        runtimeState
        && Array.isArray(activeWhen)
        && activeWhen.length > 0
        && chroniclesRequirementsMet(runtimeState, activeWhen),
      ),
    });
  }));
}

function mapContext(mapOrState) {
  const runtimeState = mapOrState?.grid ? null : mapOrState;
  const map = mapOrState?.grid ? mapOrState : chroniclesMapForState(mapOrState);
  const renderPlan = chroniclesMapRenderPlan(map);
  return { runtimeState, map, renderPlan };
}

export function chroniclesIsometricCellToWorld(scenePlan, x, y, cellSize = 2.45) {
  const centerX = Number(scenePlan?.center?.x ?? 0);
  const centerY = Number(scenePlan?.center?.y ?? 0);
  const size = Number(cellSize);
  const safeSize = Number.isFinite(size) && size > 0 ? size : 2.45;
  return Object.freeze({
    x: (Number(x) - centerX) * safeSize,
    y: 0,
    z: (Number(y) - centerY) * safeSize,
  });
}

export function chroniclesIsometricContentPlan(mapOrState = null) {
  const { runtimeState, map, renderPlan } = mapContext(mapOrState);
  return contentPlan(runtimeState, map, renderPlan);
}

export function chroniclesIsometricScenePlan(mapOrState = null) {
  const { runtimeState, map, renderPlan } = mapContext(mapOrState);
  const center = mapCenter(renderPlan.grid);
  const partyStart = Object.freeze({
    x: Number(map.partyStart?.x ?? center.x),
    y: Number(map.partyStart?.y ?? center.y),
  });

  return Object.freeze({
    mapId: renderPlan.mapId,
    title: renderPlan.title,
    sceneStyle: chroniclesIsometricSceneStyle(renderPlan.mapId),
    width: renderPlan.width,
    height: renderPlan.height,
    center,
    partyStart,
    floors: visibleFloorCells(renderPlan.grid),
    walls: visibleWallCells(renderPlan.grid),
    wallFaces: exposedWallFaces(renderPlan.grid),
    enemies: renderPlan.enemies,
    content: contentPlan(runtimeState, map, renderPlan),
  });
}
