import {
  chroniclesIsometricCellToWorld,
  chroniclesIsometricScenePlan,
} from './chroniclesIsometricScenePlan.js';

export const CHRONICLES_ISOMETRIC_CELL_SIZE = 2.45;

function normalizedCellSize(cellSize) {
  const numeric = Number(cellSize);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : CHRONICLES_ISOMETRIC_CELL_SIZE;
}

function isScenePlan(value) {
  return Boolean(
    value?.center
    && Array.isArray(value?.floors)
    && Array.isArray(value?.walls)
    && Number.isFinite(Number(value?.width))
    && Number.isFinite(Number(value?.height)),
  );
}

function projectCell(scenePlan, cell, cellSize) {
  const world = chroniclesIsometricCellToWorld(scenePlan, cell.x, cell.y, cellSize);
  return Object.freeze({
    ...cell,
    world,
  });
}

function projectContent(scenePlan, entry, cellSize) {
  const position = entry?.position;
  return Object.freeze({
    ...entry,
    world: position
      ? chroniclesIsometricCellToWorld(scenePlan, position.x, position.y, cellSize)
      : null,
  });
}

export function chroniclesIsometricContentByKind(dungeonPlan, kind) {
  if (!kind) return null;
  return (dungeonPlan?.content || []).find((entry) => entry.kind === kind) || null;
}

export function chroniclesIsometricDungeonPlan(mapOrState = null, cellSize = CHRONICLES_ISOMETRIC_CELL_SIZE) {
  const scenePlan = isScenePlan(mapOrState) ? mapOrState : chroniclesIsometricScenePlan(mapOrState);
  const size = normalizedCellSize(cellSize);

  return Object.freeze({
    mapId: scenePlan.mapId,
    cellSize: size,
    center: scenePlan.center,
    foundation: Object.freeze({
      width: (Number(scenePlan.width) + 0.25) * size,
      depth: (Number(scenePlan.height) + 0.25) * size,
    }),
    floors: Object.freeze(scenePlan.floors.map((cell) => projectCell(scenePlan, cell, size))),
    walls: Object.freeze(scenePlan.walls.map((cell) => projectCell(scenePlan, cell, size))),
    content: Object.freeze((scenePlan.content || []).map((entry) => projectContent(scenePlan, entry, size))),
  });
}
