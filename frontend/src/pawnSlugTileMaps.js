export const PAWN_SLUG_TILE_SIZE = 80;
export const PAWN_SLUG_WORLD_SCALE = 1 / 40;

const freezeRows = (rows) => Object.freeze(rows.map((row) => Object.freeze([...row])));
const freezeMarkers = (markers) => Object.freeze(markers.map((marker) => Object.freeze({ ...marker })));

export const PAWN_SLUG_TILE_LEGEND = Object.freeze({
  '#': Object.freeze({ kind: 'stone', layer: 'structure' }),
  '^': Object.freeze({ kind: 'ceiling-rib', layer: 'structure' }),
  '|': Object.freeze({ kind: 'wall-rib', layer: 'structure' }),
  'T': Object.freeze({ kind: 'torch', layer: 'prop' }),
  'G': Object.freeze({ kind: 'gate', layer: 'landmark' }),
  'C': Object.freeze({ kind: 'chain', layer: 'prop' }),
  'P': Object.freeze({ kind: 'fallen-pawn', layer: 'prop', desktopOnly: true }),
  '=': Object.freeze({ kind: 'drain', layer: 'ground' }),
});

export const PAWN_SLUG_SCENARIO_TILEMAPS = Object.freeze({
  castleDungeon: Object.freeze({
    id: 'castle-dungeon',
    label: 'Dungeon bajo el castillo',
    originX: 44.5,
    tileWorldSize: 1,
    rows: freezeRows([
      '##^#^#^#^##',
      '|T | C | T|',
      '|  | G |  |',
      '|  |   | P|',
      '===========',
    ]),
    markers: freezeMarkers([
      { id: 'dungeon-pickup-grenade', kind: 'pickup', type: 'grenade', worldX: 45.25 },
      { id: 'dungeon-enemy-knight', kind: 'enemy', type: 'knight', worldX: 48.5 },
      { id: 'dungeon-enemy-pawn', kind: 'enemy', type: 'pawn', worldX: 52.75 },
      { id: 'dungeon-exit', kind: 'transition', type: 'exterior', worldX: 55.5 },
    ]),
  }),
});

export function pawnSlugTilesForScenario(scenario) {
  if (!scenario?.rows?.length) return [];
  const width = Math.max(...scenario.rows.map((row) => row.length));
  const tiles = [];
  for (let row = 0; row < scenario.rows.length; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const symbol = scenario.rows[row][column] || ' ';
      const meta = PAWN_SLUG_TILE_LEGEND[symbol];
      if (!meta) continue;
      tiles.push(Object.freeze({
        symbol,
        row,
        column,
        x: scenario.originX + column * scenario.tileWorldSize,
        ...meta,
      }));
    }
  }
  return tiles;
}

export function pawnSlugScenarioTilesByKind(scenario, kind, { coarse = false } = {}) {
  return pawnSlugTilesForScenario(scenario).filter((tile) => tile.kind === kind && !(coarse && tile.desktopOnly));
}

export function pawnSlugScenarioMarkers(scenario, kind = null) {
  const markers = scenario?.markers || [];
  return kind ? markers.filter((marker) => marker.kind === kind) : [...markers];
}

export function pawnSlugMarkerLegacyX(marker) {
  return Math.round((Number(marker?.worldX) || 0) / PAWN_SLUG_WORLD_SCALE);
}

export function pawnSlugScenarioBounds(scenario) {
  const width = Math.max(0, ...(scenario?.rows || []).map((row) => row.length));
  const start = Number(scenario?.originX) || 0;
  return Object.freeze({
    start,
    end: start + Math.max(0, width - 1) * (Number(scenario?.tileWorldSize) || 1),
  });
}
