import { describe, expect, it } from 'vitest';
import { chroniclesMapById, chroniclesMapIds } from './chronicles/chroniclesMapCatalog.js';
import { CHRONICLES_ENEMIES, createChroniclesState, chroniclesActiveEnemies } from './chroniclesOfMatthias.js';
import {
  chroniclesEnemyCanAttackParty,
  chroniclesEnemyThreatCells,
  chroniclesPreviewEnemyTurn,
  chroniclesResolveEnemyTurn,
} from './chroniclesOfMatthiasTurns.js';

function enemy(id) {
  return CHRONICLES_ENEMIES.find((entry) => entry.id === id);
}

function standableCells(mapId) {
  const map = chroniclesMapById(mapId);
  const cells = [];
  map.grid.forEach((row, y) => [...row].forEach((tile, x) => {
    if (tile !== '#' && tile !== 'X') cells.push({ x, y });
  }));
  return cells;
}

describe('Chronicles enemy intent preview', () => {
  it('matches the real creature turn for every shipped map and every standable party cell', () => {
    let checked = 0;
    for (const mapId of chroniclesMapIds()) {
      const base = createChroniclesState(mapId);
      for (const cell of standableCells(mapId)) {
        const state = { ...base, x: cell.x, y: cell.y };
        const preview = chroniclesPreviewEnemyTurn(state);
        const events = chroniclesResolveEnemyTurn(state).enemyTurnEvents;

        const active = chroniclesActiveEnemies(state).map((entry) => entry.id);
        expect(preview.intents.map((intent) => intent.enemyId)).toEqual(active);

        for (const intent of preview.intents) {
          const event = events.find((entry) => entry.enemyId === intent.enemyId);
          if (!event) {
            expect(intent.kind).toBe('hold');
          } else if (event.type === 'attack') {
            expect(intent).toMatchObject({ kind: 'attack', targetId: event.targetId, damage: event.damage });
          } else {
            expect(intent).toMatchObject({ kind: 'move', from: event.from, to: event.to });
          }
        }
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('does not mutate the state it previews', () => {
    const state = createChroniclesState();
    const before = JSON.stringify(state);
    chroniclesPreviewEnemyTurn(state);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('telegraphs a melee creature stepping toward the party, then attacking', () => {
    const pawn = enemy('corrupted-pawn');
    const state = createChroniclesState();
    const first = chroniclesPreviewEnemyTurn(state);
    expect(first.intents.find((intent) => intent.enemyId === pawn.id)).toEqual({
      enemyId: 'corrupted-pawn',
      kind: 'move',
      from: { x: 3, y: 5 },
      to: { x: 2, y: 5 },
    });
    expect(first.attackedMemberIds).toEqual([]);

    const moved = chroniclesResolveEnemyTurn(state);
    const second = chroniclesPreviewEnemyTurn(moved);
    expect(second.intents.find((intent) => intent.enemyId === pawn.id)).toMatchObject({
      kind: 'attack',
      damage: 1,
    });
    expect(second.attackedMemberIds.length).toBe(1);
  });

  it('telegraphs the spectral bishop attacking down a clear lane without moving', () => {
    const state = {
      ...createChroniclesState(),
      x: 5,
      y: 5,
      enemyHp: 0,
      jailerHp: 0,
      spectralBishopHp: 5,
      scavengerHp: 0,
      sigilAwake: true,
    };
    const preview = chroniclesPreviewEnemyTurn(state);
    expect(preview.intents).toHaveLength(1);
    expect(preview.intents[0]).toMatchObject({ enemyId: 'spectral-bishop', kind: 'attack', from: { x: 5, y: 3 } });
  });

  it('flags a lethal blow and a wiped party', () => {
    const base = createChroniclesState();
    const doomed = {
      ...base,
      x: 5,
      y: 5,
      enemyHp: 0,
      jailerHp: 0,
      spectralBishopHp: 5,
      scavengerHp: 0,
      sigilAwake: true,
      party: base.party.map((member) => ({ ...member, hp: 1 })),
    };
    const preview = chroniclesPreviewEnemyTurn(doomed);
    expect(preview.intents[0].lethal).toBe(true);
    expect(preview.partyWouldFall).toBe(false);

    const lastStand = { ...doomed, party: base.party.map((member) => ({ ...member, hp: member.id === 'matthias' ? 1 : 0 })) };
    const fallen = chroniclesPreviewEnemyTurn(lastStand);
    expect(fallen.partyWouldFall).toBe(true);
  });

  it('is empty once the fight is over or when nothing is awake', () => {
    const state = createChroniclesState();
    expect(chroniclesPreviewEnemyTurn({ ...state, phase: 'defeated' }).intents).toEqual([]);
    expect(chroniclesPreviewEnemyTurn({ ...state, phase: 'escaped' }).intents).toEqual([]);
    expect(chroniclesPreviewEnemyTurn(null).intents).toEqual([]);
    const cleared = { ...state, enemyHp: 0, jailerHp: 0, spectralBishopHp: 0, scavengerHp: 0 };
    expect(chroniclesPreviewEnemyTurn(cleared)).toMatchObject({ intents: [], partyWouldFall: false });
  });
});

describe('Chronicles enemy threat cells', () => {
  it('returns adjacent standable cells for a reach-1 creature', () => {
    const pawn = enemy('corrupted-pawn');
    const state = createChroniclesState();
    const cells = chroniclesEnemyThreatCells(state, pawn);
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      expect(Math.abs(cell.x - 3) + Math.abs(cell.y - 5)).toBe(1);
    }
  });

  it('agrees with the attack predicate and respects line of sight for reach-2 creatures', () => {
    const bishop = enemy('spectral-bishop');
    const state = { ...createChroniclesState(), spectralBishopHp: 5, sigilAwake: true };
    const cells = chroniclesEnemyThreatCells(state, bishop);
    expect(cells).toContainEqual({ x: 5, y: 5 });
    for (const cell of cells) {
      expect(chroniclesEnemyCanAttackParty({ ...state, x: cell.x, y: cell.y }, bishop)).toBe(true);
      expect(cell.x === 5 || cell.y === 3).toBe(true);
    }
  });
});
