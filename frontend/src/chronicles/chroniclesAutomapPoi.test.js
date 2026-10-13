import { describe, expect, it } from 'vitest';
import { chroniclesPoiCategory, chroniclesDiscoveredPois } from './chroniclesAutomapPoi.js';

describe('Chronicles explored POIs', () => {
  const positionFor = (_, entry) => ({ x: entry.x, y: entry.y });
  const map = {
    exits: [
      { id: 'swordhaven-to-sewers', x: 13, y: 13, label: 'Bajar a alcantarillas' },
      { id: 'to-road', x: 9, y: 1, label: 'Camino de los estandartes' },
    ],
    interactables: [
      { id: 'weaponsmith', kind: 'merchant', visualType: 'building-forge', x: 7, y: 4, label: 'Forja de Brunna' },
      { id: 'mayor', kind: 'lore', visualType: 'building-hall', x: 11, y: 10, label: 'Ayuntamiento' },
      { id: 'mayor-reward', kind: 'quest', visualType: 'building-hall', x: 11, y: 10, label: 'Entrega secreta' },
      { id: 'letter', kind: 'lore', x: 7, y: 5, label: 'Pista secreta' },
    ],
  };
  it('classifies authored town entrances and dungeon access', () => {
    expect(chroniclesPoiCategory('exit', map.exits[0])).toBe('dungeon');
    expect(chroniclesPoiCategory('exit', map.exits[1])).toBe('exit');
    expect(chroniclesPoiCategory('interactable', map.interactables[0])).toBe('smith');
    expect(chroniclesPoiCategory('interactable', map.interactables[1])).toBe('mayor');
    expect(chroniclesPoiCategory('interactable', map.interactables[3])).toBe(null);
  });
  it('shows nothing before discovery and deduplicates quest at the mayor', () => {
    expect(chroniclesDiscoveredPois(map, new Set(), positionFor)).toEqual([]);
    const revealed = new Set(['13:13', '7:4', '11:10', '7:5']);
    const markers = chroniclesDiscoveredPois(map, revealed, positionFor);
    expect(markers.map(x => x.category).sort()).toEqual(['dungeon', 'mayor', 'smith']);
    expect(markers.find(x => x.category === 'mayor')?.label).toBe('Ayuntamiento');
    expect(markers.some(x => x.id === 'letter')).toBe(false);
    expect(markers.some(x => x.id === 'to-road')).toBe(false);
  });
});
