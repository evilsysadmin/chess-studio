export const PAWN_SLUG_TILE_SIZE = 80;

const freezeRows = (rows) => Object.freeze(rows.map((row) => Object.freeze([...row])));

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
