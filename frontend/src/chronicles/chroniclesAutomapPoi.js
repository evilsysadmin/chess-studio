import { chroniclesAutomapCellKey } from './chroniclesAutomap.js';

// Authored content remains the single source of POI coordinates. Never show
// unrevealed cells or claim that an unvisited destination has been found.
const DISPLAY = Object.freeze({
  dungeon: ['↓', 100],
  exit: ['↗', 95],
  mayor: ['H', 85],
  quest: ['!', 80],
  smith: ['F', 75],
  armorer: ['A', 75],
  guild: ['G', 75],
  inn: ['P', 75],
  healer: ['+', 75],
  temple: ['T', 75],
  shop: ['C', 75],
  guard: ['C', 70],
  treasure: ['◆', 45],
});

export function chroniclesPoiCategory(kind, entry) {
  if (kind === 'exit') {
    const text = [entry?.id, entry?.label, entry?.targetMapId, entry?.destinationMapId, entry?.action?.effects?.[0]?.mapId].join(' ').toLowerCase();
    return /sewer|crypt|dungeon|mine|cave|vault|basement|catacomb|alcantarill|cripta|mina|cueva|sótano/.test(text) ? 'dungeon' : 'exit';
  }
  if (kind === 'treasure') return 'treasure';
  if (kind !== 'interactable') return null;
  const visual = String(entry?.visualType || '');
  const id = String(entry?.id || '').toLowerCase();
  if (visual === 'building-hall' || /mayor|town-hall/.test(id)) return 'mayor';
  if (visual === 'building-forge' || /weaponsmith/.test(id)) return 'smith';
  if (visual === 'building-armor' || /armorer/.test(id)) return 'armorer';
  if (visual === 'building-guild' || entry?.guild) return 'guild';
  if (visual === 'building-tavern' || /-inn$/.test(id)) return 'inn';
  if (visual === 'building-temple') return 'temple';
  if (visual === 'building-watch') return 'guard';
  if (entry?.kind === 'service') return 'healer';
  if (entry?.shop || entry?.kind === 'merchant') return 'shop';
  if (entry?.kind === 'quest') return 'quest';
  // Generic story snippets do not clutter the map or leak quest clues.
  return null;
}

export function chroniclesDiscoveredPois(map, revealed, positionFor) {
  if (!map || !revealed || typeof positionFor !== 'function') return [];
  const candidates = [
    ['exit', map.exits || []],
    ['interactable', map.interactables || []],
    ['treasure', map.treasures || []],
  ];
  const tiles = new Map();
  candidates.forEach(([kind, entries]) => entries.forEach((entry) => {
    const category = chroniclesPoiCategory(kind, entry);
    if (!category) return;
    const position = positionFor(map, entry);
    if (!position) return;
    const cell = chroniclesAutomapCellKey(position.x, position.y);
    if (!revealed.has(cell)) return;
    const [glyph, priority] = DISPLAY[category];
    const marker = {
      id: entry.id || `${kind}-${cell}`, category, glyph, label: entry.label || category,
      position, priority,
    };
    const previous = tiles.get(cell);
    if (!previous || marker.priority > previous.priority) tiles.set(cell, marker);
  }));
  return [...tiles.values()];
}
