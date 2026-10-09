import { describe, expect, it } from 'vitest';

import {
  chroniclesApplyRunCheckpoint,
  chroniclesRunCheckpointFingerprint,
  chroniclesRunCheckpointPayload,
  chroniclesRunHasRuntimeCheckpoint,
  chroniclesWorldFlagsForCheckpoint,
} from './chroniclesRunCheckpoint.js';
import { createChroniclesState } from '../chroniclesOfMatthias.js';
import { chroniclesMapById } from './chroniclesMapCatalog.js';

function anotherWalkableCell(map, occupied = []) {
  const blocked = new Set(occupied.map(({ x, y }) => `${x},${y}`));
  for (let y = 0; y < map.grid.length; y += 1) {
    for (let x = 0; x < map.grid[y].length; x += 1) {
      if (map.grid[y][x] !== '#' && !blocked.has(`${x},${y}`)) return { x, y };
    }
  }
  throw new Error('Chronicles test map needs another walkable cell');
}

describe('Chronicles checkpoint projection', () => {
  it('distinguishes a fresh run from one that already owns runtime checkpoint state', () => {
    expect(chroniclesRunHasRuntimeCheckpoint(null)).toBe(false);
    expect(chroniclesRunHasRuntimeCheckpoint({ worldFlags: {} })).toBe(false);
    expect(chroniclesRunHasRuntimeCheckpoint({
      worldFlags: { '__chrRuntime.version': 1 },
    })).toBe(true);
  });

  it('projects authored world state plus bounded runtime state, never renderer/UI noise', () => {
    const map = chroniclesMapById('gallery-of-forks');
    const enemy = map.enemies[0];
    const state = {
      ...createChroniclesState(map.id),
      galleryLeverPulled: true,
      [enemy.hpKey]: Math.max(0, Number(enemy.maxHp || 1) - 1),
      x: map.partyStart.x,
      y: map.partyStart.y,
      message: 'ephemeral',
      enemyTurnEvents: [{ kind: 'attack' }],
      arbitraryUiFlag: true,
    };

    const flags = chroniclesWorldFlagsForCheckpoint(state);

    expect(flags.galleryLeverPulled).toBe(true);
    expect(flags[enemy.hpKey]).toBe(state[enemy.hpKey]);
    expect(flags).not.toHaveProperty('message');
    expect(flags).not.toHaveProperty('enemyTurnEvents');
    expect(flags).not.toHaveProperty('arbitraryUiFlag');
  });

  it('keeps authored flags from earlier maps because cross-map consequences survive transitions', () => {
    const payload = chroniclesRunCheckpointPayload({
      ...createChroniclesState('gallery-of-forks'),
      sigilAwake: true,
      galleryLeverPulled: true,
    }, 4);

    expect(payload.expectedWorldVersion).toBe(4);
    expect(payload.currentMapId).toBe('gallery-of-forks');
    expect(payload.worldFlags).toMatchObject({
      sigilAwake: true,
      galleryLeverPulled: true,
    });
  });

  it('normalizes explicit monotonic ledgers without inventing entries', () => {
    const payload = chroniclesRunCheckpointPayload({
      ...createChroniclesState(),
      consumedContentIds: ['crypt-lever', 'crypt-lever', '', null],
      claimedRewards: ['reward:a', ' reward:a ', 'reward:b'],
    }, 0);

    expect(payload.consumedContentIds).toEqual(['crypt-lever']);
    expect(payload.claimedRewards).toEqual(['reward:a', 'reward:b']);
  });

  it('terminalizes defeat immediately but leaves successful extraction finalization to the adapter', () => {
    expect(chroniclesRunCheckpointPayload({
      ...createChroniclesState(),
      phase: 'defeated',
    }, 2).terminalStatus).toBe('defeated');

    const escaped = {
      ...createChroniclesState(),
      phase: 'escaped',
    };
    expect(chroniclesRunCheckpointPayload(escaped, 3)).not.toHaveProperty('terminalStatus');
    expect(chroniclesRunCheckpointPayload(
      escaped,
      3,
      { terminalStatus: 'completed' },
    ).terminalStatus).toBe('completed');

    expect(() => chroniclesRunCheckpointPayload(
      createChroniclesState(),
      4,
      { terminalStatus: 'completed' },
    )).toThrow(/escaped phase/i);
    expect(chroniclesRunCheckpointPayload(createChroniclesState(), 4)).not.toHaveProperty('terminalStatus');
  });

  it('rejects missing map identity or invalid CAS versions', () => {
    expect(() => chroniclesRunCheckpointPayload({}, 0)).toThrow(/current map/i);
    expect(() => chroniclesRunCheckpointPayload({ mapId: 'crypt-eight-squares' }, -1)).toThrow(/worldVersion/i);
  });
});

describe('Chronicles run checkpoint recovery', () => {
  it('round-trips runtime state needed for F5/re-entry without resurrecting damage or spent charges', () => {
    const map = chroniclesMapById('gallery-of-forks');
    const enemy = map.enemies[0];
    const initial = createChroniclesState(map.id);
    const partyCell = anotherWalkableCell(map, [{ x: initial.x, y: initial.y }]);
    const enemyCell = anotherWalkableCell(map, [
      { x: initial.x, y: initial.y },
      partyCell,
    ]);
    const woundedParty = initial.party.map((member, index) => (
      index === 0 ? { ...member, hp: Math.max(0, member.maxHp - 3) } : member
    ));
    const enemyHp = Math.max(0, Number(initial[enemy.hpKey] || enemy.maxHp || 1) - 1);
    const snapshot = {
      ...initial,
      x: partyCell.x,
      y: partyCell.y,
      direction: 2,
      turns: 17,
      round: 6,
      explorationEnemySteps: 9,
      turnPhase: 'party',
      phase: 'combat',
      initiative: {
        version: 1,
        die: '1d8',
        round: 2,
        cursor: 1,
        order: [
          { id: 'matthias', kind: 'party', name: 'Matthias', agility: 4, roll: 7, initiative: 11 },
          { id: enemy.id, kind: 'enemy', name: enemy.name, agility: 3, roll: 5, initiative: 8 },
        ],
      },
      party: woundedParty,
      [enemy.hpKey]: enemyHp,
      enemyPositions: { [enemy.id]: enemyCell },
      classAbilityCharges: {
        matthias: 0,
        rook: 1,
        bishop: 0,
        knight: 1,
      },
      consumedContentIds: ['gallery-lever'],
      claimedRewards: ['reward:gallery'],
      message: 'runtime-only narration',
    };
    const payload = chroniclesRunCheckpointPayload(snapshot, 3);

    const recovered = chroniclesApplyRunCheckpoint({
      ...createChroniclesState(map.id),
      round: 1,
      turnPhase: 'party',
      enemyPositions: {},
      enemyTurnEvents: [],
      classAbilityCharges: {
        matthias: 2,
        rook: 2,
        bishop: 2,
        knight: 2,
      },
    }, {
      worldFlags: payload.worldFlags,
      consumedContentIds: payload.consumedContentIds,
      claimedRewards: payload.claimedRewards,
    });

    expect(recovered.x).toBe(snapshot.x);
    expect(recovered.y).toBe(snapshot.y);
    expect(recovered.direction).toBe(2);
    expect(recovered.turns).toBe(17);
    expect(recovered.round).toBe(6);
    expect(recovered.explorationEnemySteps).toBe(9);
    expect(recovered.phase).toBe('combat');
    expect(recovered.initiative).toEqual(snapshot.initiative);
    expect(recovered.party[0].hp).toBe(snapshot.party[0].hp);
    expect(recovered[enemy.hpKey]).toBe(enemyHp);
    expect(recovered.enemyPositions[enemy.id]).toEqual(enemyCell);
    expect(recovered.classAbilityCharges.matthias).toBe(0);
    expect(recovered.classAbilityCharges.bishop).toBe(0);
    expect(recovered.consumedContentIds).toEqual(['gallery-lever']);
    expect(recovered.claimedRewards).toEqual(['reward:gallery']);
    expect(recovered.message).not.toBe('runtime-only narration');
  });

  it('round-trips individual party combat cells across F5/re-entry', () => {
    const base = createChroniclesState();
    const snapshot = {
      ...base,
      phase: 'combat',
      partyPositions: {
        matthias: { x: 1, y: 5 },
        rook: { x: 2, y: 5 },
        bishop: { x: 1, y: 4 },
        knight: { x: 3, y: 4 },
      },
      initiative: {
        version: 1,
        die: '1d8',
        round: 3,
        cursor: 0,
        order: [
          { id: 'matthias', kind: 'party', name: 'Matthias', agility: 4, roll: 5, initiative: 9 },
          { id: 'corrupted-pawn', kind: 'enemy', name: 'Peón', agility: 1, roll: 5, initiative: 6 },
        ],
      },
    };
    const payload = chroniclesRunCheckpointPayload(snapshot, 2);
    const recovered = chroniclesApplyRunCheckpoint(
      { ...base, partyPositions: {} },
      {
        worldFlags: payload.worldFlags,
        consumedContentIds: [],
        claimedRewards: [],
      },
    );

    expect(recovered.phase).toBe('combat');
    expect(recovered.partyPositions).toEqual(snapshot.partyPositions);
    expect(recovered.initiative).toEqual(snapshot.initiative);
    expect(chroniclesRunCheckpointFingerprint(snapshot)).not.toBe(
      chroniclesRunCheckpointFingerprint({ ...snapshot, partyPositions: {} }),
    );
  });

  it('round-trips inventory and quest state across F5/re-entry', () => {
    const base = createChroniclesState('gallery-of-forks');
    const snapshot = {
      ...base,
      inventory: {
        'charred-key': {
          id: 'charred-key',
          name: 'Llave carbonizada',
          description: 'Abre algo que probablemente no debería abrirse.',
          quantity: 2,
        },
      },
      quests: {
        'blind-king-key': {
          id: 'blind-king-key',
          title: 'La llave del rey ciego',
          description: 'Una deuda incómodamente literal.',
          objective: 'Lleva la llave a la capilla.',
          order: 3,
          status: 'active',
        },
      },
    };
    const payload = chroniclesRunCheckpointPayload(snapshot, 2);
    const recovered = chroniclesApplyRunCheckpoint(createChroniclesState(base.mapId), {
      worldFlags: payload.worldFlags,
      inventory: payload.inventory,
      quests: payload.quests,
      consumedContentIds: payload.consumedContentIds,
      claimedRewards: payload.claimedRewards,
    });

    expect(recovered.inventory).toEqual(snapshot.inventory);
    expect(recovered.quests).toEqual(snapshot.quests);
    expect(chroniclesRunCheckpointFingerprint(snapshot)).not.toBe(
      chroniclesRunCheckpointFingerprint({
        ...snapshot,
        inventory: {
          ...snapshot.inventory,
          'charred-key': { ...snapshot.inventory['charred-key'], quantity: 1 },
        },
      }),
    );
  });

  it('treats authoritative terminal status as stronger than a stale runtime phase', () => {
    const base = createChroniclesState();
    const completed = chroniclesApplyRunCheckpoint(base, {
      runStatus: 'completed',
      worldFlags: {
        '__chrRuntime.version': 1,
        '__chrRuntime.phase': 'explore',
      },
      consumedContentIds: [],
      claimedRewards: [],
    });
    const defeated = chroniclesApplyRunCheckpoint(base, {
      status: 'defeated',
      worldFlags: {
        '__chrRuntime.version': 1,
        '__chrRuntime.phase': 'explore',
      },
      consumedContentIds: [],
      claimedRewards: [],
    });

    expect(completed.phase).toBe('escaped');
    expect(defeated.phase).toBe('defeated');
    expect(defeated.turnPhase).toBe('party');
  });

  it('keeps old checkpoints compatible when no runtime namespace is present', () => {
    const base = createChroniclesState('gallery-of-forks');
    const recovered = chroniclesApplyRunCheckpoint(
      { ...base, message: 'runtime-message' },
      {
        worldFlags: { galleryLeverPulled: true, cryptSigilAwake: true },
        consumedContentIds: ['gallery-lever'],
        claimedRewards: ['reward:gallery'],
      },
    );

    expect(recovered.galleryLeverPulled).toBe(true);
    expect(recovered.cryptSigilAwake).toBe(true);
    expect(recovered.message).toBe('runtime-message');
    expect(recovered.consumedContentIds).toEqual(['gallery-lever']);
    expect(recovered.claimedRewards).toEqual(['reward:gallery']);
  });

  it('fingerprints durable runtime changes but still ignores narration-only churn', () => {
    const base = createChroniclesState('gallery-of-forks');
    const original = chroniclesRunCheckpointFingerprint(base);
    const narrationOnly = chroniclesRunCheckpointFingerprint({ ...base, message: 'dos' });
    expect(narrationOnly).toBe(original);

    const map = chroniclesMapById(base.mapId);
    const moved = anotherWalkableCell(map, [{ x: base.x, y: base.y }]);
    expect(chroniclesRunCheckpointFingerprint({ ...base, ...moved })).not.toBe(original);

    const wounded = {
      ...base,
      party: base.party.map((member, index) => (
        index === 0 ? { ...member, hp: Math.max(0, member.hp - 1) } : member
      )),
    };
    expect(chroniclesRunCheckpointFingerprint(wounded)).not.toBe(original);
  });
});
