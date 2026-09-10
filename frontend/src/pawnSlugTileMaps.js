export const PAWN_SLUG_TILE_SIZE = 80;
export const PAWN_SLUG_WORLD_SCALE = 1 / 40;

const freezeRows = (rows) => Object.freeze(rows.map((row) => Object.freeze([...row])));
const freezeMarkers = (markers) => Object.freeze(markers.map((marker) => Object.freeze({ ...marker })));
const freezePlatforms = (platforms) => Object.freeze(platforms.map((platform) => (
  Object.isFrozen(platform) ? platform : Object.freeze({ ...platform })
)));

export const PAWN_SLUG_TILE_LEGEND = Object.freeze({
  '#': Object.freeze({ kind: 'stone', layer: 'structure' }),
  '^': Object.freeze({ kind: 'ceiling-rib', layer: 'structure' }),
  '|': Object.freeze({ kind: 'wall-rib', layer: 'structure' }),
  'T': Object.freeze({ kind: 'torch', layer: 'prop' }),
  'G': Object.freeze({ kind: 'gate', layer: 'landmark' }),
  'C': Object.freeze({ kind: 'chain', layer: 'prop' }),
  'P': Object.freeze({ kind: 'fallen-pawn', layer: 'prop', desktopOnly: true }),
  '=': Object.freeze({ kind: 'drain', layer: 'ground' }),
  'Y': Object.freeze({ kind: 'forest-trunk', layer: 'structure' }),
  'R': Object.freeze({ kind: 'forest-root', layer: 'ground' }),
  'K': Object.freeze({ kind: 'fallen-knight', layer: 'landmark' }),
  '*': Object.freeze({ kind: 'fireflies', layer: 'atmosphere', desktopOnly: true }),
});

export const PAWN_SLUG_SCENARIO_TILEMAPS = Object.freeze({
  fallenForest: Object.freeze({
    id: 'fallen-forest',
    label: 'Bosque de las piezas caídas',
    originX: 10.5,
    tileWorldSize: 1,
    rows: freezeRows([
      '  Y   Y    Y   Y  ',
      ' *   Y  *   Y     ',
      '   K      Y    *  ',
      'RRRR RRRRR RRRRRRR',
    ]),
    platforms: freezePlatforms([
      { id: 'forest-root-rise', x: 14.2, y: 1.05, width: 3.3, depth: 1.45, theme: 'stone', oneWay: true },
      { id: 'forest-broken-statue', x: 18.1, y: 2.35, width: 2.7, depth: 1.4, theme: 'stone', oneWay: true },
      { id: 'forest-branch-post', x: 24.7, y: 3.5, width: 4.4, depth: 1.55, theme: 'timber', oneWay: true },
    ]),
    markers: freezeMarkers([
      { id: 'forest-enemy-pawn', kind: 'enemy', type: 'pawn', worldX: 13.8 },
      { id: 'forest-enemy-knight', kind: 'enemy', type: 'knight', worldX: 20.5 },
      { id: 'forest-pickup-machinegun', kind: 'pickup', type: 'machinegun', worldX: 23.0 },
      { id: 'forest-exit', kind: 'transition', type: 'battlefield', worldX: 27.5 },
    ]),
  }),
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
    platforms: freezePlatforms([
      { id: 'dungeon-catwalk', x: 48.8, y: 4.15, width: 6.2, depth: 1.5, theme: 'steel', oneWay: true },
    ]),
    markers: freezeMarkers([
      { id: 'dungeon-pickup-grenade', kind: 'pickup', type: 'grenade', worldX: 45.25 },
      { id: 'dungeon-enemy-knight', kind: 'enemy', type: 'knight', worldX: 48.5 },
      { id: 'dungeon-enemy-pawn', kind: 'enemy', type: 'pawn', worldX: 52.75 },
      { id: 'dungeon-exit', kind: 'transition', type: 'exterior', worldX: 55.5 },
    ]),
  }),
});

const LEGACY_PLATFORM_LAYOUT = [
  { id: 'broken-bridge-a', x: 33.6, y: 1.55, width: 4.9, depth: 1.35, theme: 'steel' },
  { id: 'broken-bridge-b', x: 39.2, y: 3.0, width: 3.0, depth: 1.35, theme: 'steel' },
  { id: 'shell-crater-rim', x: 59.5, y: 1.35, width: 4.1, depth: 1.45, theme: 'stone' },
  { id: 'signal-platform', x: 67.7, y: 3.1, width: 3.9, depth: 1.45, theme: 'timber' },
  { id: 'bunker-roof', x: 77.6, y: 2.15, width: 6.8, depth: 1.65, theme: 'stone' },
  { id: 'gantry-lower', x: 88.0, y: 1.55, width: 4.5, depth: 1.35, theme: 'steel' },
  { id: 'gantry-upper', x: 93.0, y: 3.65, width: 4.1, depth: 1.35, theme: 'steel' },
  { id: 'last-line-wall', x: 103.3, y: 2.25, width: 5.1, depth: 1.6, theme: 'stone' },
  { id: 'boss-approach', x: 109.1, y: 3.65, width: 3.4, depth: 1.5, theme: 'steel' },
];

export const PAWN_SLUG_PLATFORM_LAYOUT = freezePlatforms([
  ...PAWN_SLUG_SCENARIO_TILEMAPS.fallenForest.platforms,
  ...LEGACY_PLATFORM_LAYOUT.slice(0, 2),
  ...PAWN_SLUG_SCENARIO_TILEMAPS.castleDungeon.platforms,
  ...LEGACY_PLATFORM_LAYOUT.slice(2),
]);

export function pawnSlugTilesForScenario(scenario) {
  if (!scenario?.rows?.length) return [];
  const width = Math.max(...scenario.rows.map((row) => row.length));
  const tiles = [];
  for (let row = 0; row < scenario.rows.length; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const symbol = scenario.rows[row][column] || ' ';
      const meta = PAWN_SLUG_TILE_LEGEND[symbol];
      if (!meta) continue;
      tiles.push(Object.freeze({ symbol, row, column, x: scenario.originX + column * scenario.tileWorldSize, ...meta }));
    }
  }
  return tiles;
}

export function pawnSlugScenarioTilesByKind(scenario, kind, { coarse = false } = {}) {
  return pawnSlugTilesForScenario(scenario).filter((tile) => tile.kind === kind && !(coarse && tile.desktopOnly));
}

export function pawnSlugScenarioPlatforms(scenario) {
  return [...(scenario?.platforms || [])];
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
  const tileWorldSize = Number(scenario?.tileWorldSize) || 1;
  return Object.freeze({ start, end: start + width * tileWorldSize });
}
