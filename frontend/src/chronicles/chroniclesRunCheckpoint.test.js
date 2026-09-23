import { describe, expect, it } from 'vitest';

import {
  chroniclesApplyRunCheckpoint,
  chroniclesRunCheckpointFingerprint,
  chroniclesRunCheckpointPayload,
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
      turnPhase: 'party',
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
    expect(recovered.party[0].hp).toBe(snapshot.party[0].hp);
    expect(recovered[enemy.hpKey]).toBe(enemyHp);
    expect(recovered.enemyPositions[enemy.id]).toEqual(enemyCell);
    expect(recovered.classAbilityCharges.matthias).toBe(0);
    expect(recovered.classAbilityCharges.bishop).toBe(0);
    expect(recovered.consumedContentIds).toEqual(['gallery-lever']);
    expect(recovered.claimedRewards).toEqual(['reward:gallery']);
    expect(recovered.message).not.toBe('runtime-only narration');
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
