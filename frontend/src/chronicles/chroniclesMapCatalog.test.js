import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CHRONICLES_MAP_ID,
  chroniclesMapById,
  chroniclesMapIds,
  chroniclesMapInitialEnemyState,
  chroniclesMapRenderPlan,
  chroniclesMapTileAt,
  chroniclesMapWallMaterialIdAt,
  chroniclesValidateMapDefinition,
} from './chroniclesMapCatalog.js';

describe('Chronicles declarative map catalog', () => {
  it('loads Swordhaven as a safe, static and reachable 19x19 settlement', () => {
    const town = chroniclesMapById('swordhaven-square');
    expect(town.title).toBe('Swordhaven');
    expect(town.regionKind).toBe('settlement');
    expect(town.layoutMode).toBe('authored');
    expect(town.grid).toHaveLength(19);
    expect(town.grid.every(row => row.length === 19)).toBe(true);
    expect(town.enemies).toHaveLength(0);
    expect(town.exits.map(exit => exit.id)).toContain('swordhaven-south-gate');
    const access = [
      ['swordhaven-forge', 4, 7],
      ['swordhaven-armor', 14, 7],
      ['swordhaven-tavern', 4, 15],
      ['swordhaven-magic', 14, 15],
      ['swordhaven-temple', 9, 5],
    ];
    expect(town.interactables.map(item => item.id)).toEqual(access.map(item => item[0]));
    const visited = new Set();
    const queue = [[town.partyStart.x, town.partyStart.y]];
    while (queue.length) {
      const [x, y] = queue.shift();
      const key = x + ':' + y;
      if (visited.has(key) || chroniclesMapTileAt(town, x, y) === '#') continue;
      visited.add(key);
      queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    for (const [, x, y] of access) {
      expect(chroniclesMapTileAt(town, x, y)).not.toBe('#');
      expect(visited.has(x + ':' + y)).toBe(true);
    }
    expect(visited.has('9:17')).toBe(true);
    expect(chroniclesMapTileAt(town, 9, 9)).toBe('#'); // Fountain footprint.
  });


  it('loads the current crypt as a standalone data file', () => {
    const map = chroniclesMapById(DEFAULT_CHRONICLES_MAP_ID);

    expect(chroniclesMapIds()).toContain('crypt-eight-squares');
    expect(map.title).toBe('Cripta de las Ocho Casillas');
    expect(map.grid).toEqual([
      '#######',
      '#..X..#',
      '#.###.#',
      '#...#.#',
      '#.#S#.#',
      '#P.E..#',
      '#######',
    ]);
    expect(chroniclesMapTileAt(map, 3, 1)).toBe('X');
    expect(chroniclesMapTileAt(map, -1, 0)).toBe('#');
    expect(map.materials?.lightingProfile).toBe('crypt-dark');
    expect(Object.values(map.materials?.wallLegend || {})).toEqual(['D01', 'D02', 'D03', 'D04', 'D05']);
    expect(chroniclesMapWallMaterialIdAt(map, 0, 0)).toBe('D01');
    expect(chroniclesMapWallMaterialIdAt(map, 4, 2)).toBe('D05');
    expect(chroniclesMapWallMaterialIdAt(map, 3, 1)).toBeNull();
  });

  it('owns enemy AI, interactions, rewards, treasure, trap and exit rules', () => {
    const map = chroniclesMapById(DEFAULT_CHRONICLES_MAP_ID);
    const jailer = map.enemies.find((enemy) => enemy.id === 'gate-jailer');
    const knight = map.enemies.find((enemy) => enemy.id === 'scavenger-knight');
    const bishop = map.enemies.find((enemy) => enemy.id === 'spectral-bishop');
    const pawn = map.enemies.find((enemy) => enemy.id === 'corrupted-pawn');

    expect(pawn.ai).toMatchObject({
      movement: 'cardinal-roam',
      engagedMovement: 'cardinal-chase',
      engageRange: 1,
    });
    expect(jailer.ai).toMatchObject({
      movement: 'patrol-route',
      engagedMovement: 'cardinal-chase',
      engageRange: 2,
    });
    expect(jailer.ai.patrolRoute).toEqual([
      { x: 3, y: 1 },
      { x: 2, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
      { x: 4, y: 1 },
      { x: 5, y: 1 },
      { x: 4, y: 1 },
    ]);
    expect(knight.ai).toMatchObject({
      movement: 'cardinal-roam',
      engagedMovement: 'knight-chase',
      engageRange: 4,
    });
    expect(knight.onDefeat.effects).toContainEqual({ type: 'set', key: 'blackGateKey', value: true });
    expect(bishop.onDefeat.effects).toContainEqual({ type: 'heal-party', amount: 1 });
    expect(map.triggers).toEqual([
      expect.objectContaining({ id: 'ancient-sigil', tile: 'S', label: 'Activar sello' }),
    ]);
    expect(map.interactables.map((entry) => entry.id)).toEqual(['rune-cache-lever']);
    expect(map.treasures).toEqual([
      expect.objectContaining({
        id: 'rune-core',
        kind: 'pickup',
        when: expect.arrayContaining([
          expect.objectContaining({ key: 'runeCacheOpened', equals: true }),
        ]),
      }),
    ]);
    expect(map.exits).toEqual([
      expect.objectContaining({
        id: 'black-gate',
        tile: 'X',
        requirements: expect.arrayContaining([
          expect.objectContaining({ key: 'blackGateKey', equals: true }),
        ]),
      }),
    ]);
    expect(map.traps).toEqual([]);
  });

  it('derives initial enemy health and keyed positions from data instead of engine constants', () => {
    expect(chroniclesMapInitialEnemyState()).toEqual({
      enemyHp: 6,
      jailerHp: 8,
      spectralBishopHp: 5,
      scavengerHp: 6,
      scavengerPosition: 'gate',
    });
  });

  it('exposes a render plan with topology, props and reusable visual roles', () => {
    const crypt = chroniclesMapRenderPlan(chroniclesMapById('crypt-eight-squares'));
    const gallery = chroniclesMapRenderPlan(chroniclesMapById('gallery-of-forks'));

    expect(gallery.mapId).toBe('gallery-of-forks');
    expect(gallery.grid).not.toEqual(crypt.grid);
    expect(gallery.width).toBe(7);
    expect(gallery.height).toBe(7);
    expect(gallery.enemies).toEqual([
      { id: 'fork-stalker', visualType: 'fork-stalker', visualScale: 0.96, visualMotion: 'skitter' },
      { id: 'gate-jailer', visualType: 'gate-jailer', visualScale: 1, visualMotion: 'grounded' },
    ]);
    expect(gallery.lever?.position).toEqual({ x: 5, y: 5 });
    expect(gallery.pickup?.position).toEqual({ x: 5, y: 4 });
    expect(gallery.sigil).toBeNull();
  });

  it('keeps content identity separate from reusable visual roles', () => {
    const synthetic = {
      id: 'synthetic-room',
      title: 'Synthetic',
      grid: ['###', '#.#', '###'],
      enemies: [{ id: 'fork-warden', visualType: 'gate-jailer' }],
      triggers: [],
      interactables: [],
      treasures: [],
    };

    expect(chroniclesMapRenderPlan(synthetic).enemies).toEqual([
      { id: 'fork-warden', visualType: 'gate-jailer', visualScale: 1, visualMotion: 'grounded' },
    ]);
  });

  it('rejects broken authoring data before a room reaches gameplay', () => {
    const base = {
      id: 'contract-room',
      title: 'Contract room',
      grid: ['#####', '#...#', '#.X.#', '#####'],
      partyStart: { x: 1, y: 1, direction: 1 },
      initialFlags: {},
      enemies: [
        {
          id: 'warden',
          name: 'warden',
          x: 2,
          y: 1,
          hpKey: 'wardenHp',
          maxHp: 3,
          retaliation: 1,
          activation: 'always',
          ai: { movement: 'hold', attackReach: 1 },
        },
      ],
      triggers: [],
      interactables: [],
      treasures: [],
      traps: [],
      exits: [
        {
          id: 'exit',
          kind: 'exit',
          tile: 'X',
          openLabel: 'Salir',
          lockedLabel: 'Mirar',
          action: { effects: [{ type: 'set', key: 'phase', value: 'escaped' }] },
        },
      ],
      initialJournal: { id: 'entry', title: 'Entry', body: 'Entry', sigil: 'I' },
      introMessage: 'Entry',
    };

    expect(() => chroniclesValidateMapDefinition({
      ...base,
      partyStart: { x: 0, y: 0, direction: 1 },
    })).toThrow(/partyStart cannot occupy a wall/i);

    expect(() => chroniclesValidateMapDefinition({
      ...base,
      enemies: [
        ...base.enemies,
        { ...base.enemies[0], id: 'second-warden' },
      ],
    })).toThrow(/duplicate enemy hpKey/i);

    expect(() => chroniclesValidateMapDefinition({
      ...base,
      enemies: [{ ...base.enemies[0], ai: { movement: 'teleport-chaos', attackReach: 1 } }],
    })).toThrow(/unsupported movement/i);

    expect(() => chroniclesValidateMapDefinition({
      ...base,
      interactables: [{
        id: 'exit',
        kind: 'lever',
        x: 3,
        y: 1,
        label: 'Palanca',
        action: { effects: [] },
      }],
    })).toThrow(/duplicate content id/i);

    expect(() => chroniclesValidateMapDefinition({
      ...base,
      materials: {
        wallLegend: { 1: 'D01' },
        wallGrid: ['11111', '1...1', '1.1.1', '11111'],
      },
    })).toThrow(/non-wall 2,2 cannot declare wall material/i);

    expect(() => chroniclesValidateMapDefinition({
      ...base,
      materials: {
        wallLegend: { 1: 'V01' },
        wallGrid: ['11111', '1...1', '1...1', '11111'],
      },
    })).toThrow(/invalid wall material V01/i);
  });

  it('repairs stale authored wall masks only for authoritative seeded layouts', () => {
    const remote = chroniclesValidateMapDefinition({
      id: 'procedural-room',
      title: 'Procedural room',
      grid: ['#####', '#...#', '#.#.#', '#####'],
      partyStart: { x: 1, y: 1, direction: 1 },
      initialFlags: {},
      enemies: [],
      triggers: [],
      interactables: [],
      treasures: [],
      traps: [],
      exits: [],
      initialJournal: { id: 'entry', title: 'Entry', body: 'Entry', sigil: 'I' },
      introMessage: 'Entry',
      generation: { kind: 'seeded-layout' },
      materials: {
        wallLegend: { 1: 'D01', 2: 'D02' },
        wallGrid: ['11111', '1...1', '1...1', '11111'],
      },
    });

    expect(remote.materials.wallGrid[2][2]).not.toBe('.');
    expect(['D01', 'D02']).toContain(chroniclesMapWallMaterialIdAt(remote, 2, 2));
  });

  it('rejects transitions to maps that are not part of the catalog contract', () => {
    const source = {
      id: 'transition-room',
      title: 'Transition room',
      grid: ['#####', '#.X.#', '#####'],
      partyStart: { x: 1, y: 1, direction: 1 },
      initialFlags: {},
      enemies: [],
      triggers: [],
      interactables: [],
      treasures: [],
      traps: [],
      exits: [{
        id: 'exit',
        kind: 'exit',
        tile: 'X',
        openLabel: 'Salir',
        lockedLabel: 'Mirar',
        action: { effects: [{ type: 'transition-map', mapId: 'missing-room' }] },
      }],
      initialJournal: { id: 'entry', title: 'Entry', body: 'Entry', sigil: 'I' },
      introMessage: 'Entry',
    };

    expect(() => chroniclesValidateMapDefinition(source, ['transition-room'])).toThrow(/unknown map missing-room/i);
  });
});
