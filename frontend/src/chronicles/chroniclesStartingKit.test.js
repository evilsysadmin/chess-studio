import { describe, expect, it } from 'vitest';
import { createChroniclesState, chroniclesPartyAttackStats } from '../chroniclesOfMatthias.js';
import { chroniclesGoldBalance } from './chroniclesContentRuntime.js';
import { CHRONICLES_EQUIPMENT, chroniclesEquippedItem, chroniclesUnequipItem } from './chroniclesEquipment.js';
import { chroniclesApplyRunCheckpoint, chroniclesRunCheckpointPayload } from './chroniclesRunCheckpoint.js';
import {
  CHRONICLES_STARTING_GOLD,
  CHRONICLES_STARTER_WEAPON_BY_CLASS,
  chroniclesApplyStartingKit,
} from './chroniclesStartingKit.js';

const EMPTY_RUN = Object.freeze({
  worldVersion: 0,
  runStatus: 'active',
  worldFlags: {},
  inventory: {},
  quests: {},
  consumedContentIds: [],
  claimedRewards: [],
});

function fresh() {
  return chroniclesApplyRunCheckpoint(
    createChroniclesState('swordhaven-first-book', null, { rules: 'mm3' }),
    EMPTY_RUN,
  );
}

describe('Chronicles · MM3 starting kit', () => {
  it('starts a canonical company with 40 shared gold and conventional class-legal equipped weapons', () => {
    const state = fresh();
    expect(CHRONICLES_STARTING_GOLD).toBe(40);
    expect(chroniclesGoldBalance(state)).toBe(40);
    expect(Object.keys(state.inventory)).toEqual(['crown-gold']);
    expect(Object.keys(state.equipment)).toHaveLength(4);
    expect(state.equipment).toMatchObject({
      matthias: { weapon: 'bronze-sword' },
      rook: { weapon: 'bronze-mace' },
      bishop: { weapon: 'bronze-mace' },
      knight: { weapon: 'wooden-bow' },
    });
    for (const member of state.party) {
      const weapon = chroniclesEquippedItem(state, member.id, 'weapon');
      expect(weapon, member.name).toBeTruthy();
      expect(weapon.id).toBe(CHRONICLES_STARTER_WEAPON_BY_CLASS[member.mm3.classId]);
      expect(member.role).toBe(member.mm3.classLabel);
      expect(member.attackName).toBe('Golpe desarmado');
    }
    expect(CHRONICLES_EQUIPMENT['wooden-bow'].name).toBe('Arco corto de madera');
    expect(chroniclesPartyAttackStats(state, 'matthias').reach).toBe(1);
    expect(chroniclesPartyAttackStats(state, 'bishop').reach).toBe(1);
    expect(chroniclesPartyAttackStats(state, 'knight').reach).toBe(3);
    expect(chroniclesPartyAttackStats(state, 'knight').damage).toBeGreaterThan(0);
  });

  it('keeps the starting kit inside the ordinary checkpoint and restores exactly what was saved', () => {
    let state = fresh();
    state = chroniclesUnequipItem(state, 'matthias', 'weapon');
    const gold = state.inventory['crown-gold'];
    state = { ...state, inventory: { ...state.inventory, 'crown-gold': { ...gold, quantity: 13 } } };
    const checkpoint = chroniclesRunCheckpointPayload(state, 0);
    const resumed = chroniclesApplyRunCheckpoint(
      createChroniclesState('swordhaven-first-book', null, { rules: 'mm3' }),
      {
        worldVersion: 1,
        runStatus: 'active',
        ...checkpoint,
      },
    );
    expect(chroniclesGoldBalance(resumed)).toBe(13);
    expect(chroniclesEquippedItem(resumed, 'matthias', 'weapon')).toBeNull();
    expect(resumed.inventory['bronze-sword'].quantity).toBe(1);
    expect(chroniclesEquippedItem(resumed, 'knight', 'weapon')?.id).toBe('wooden-bow');
    expect(chroniclesApplyStartingKit(resumed, EMPTY_RUN)).toBe(resumed);
  });

  it('never gives money or weapons to Tactics, established/changed server runs or defeated runs', () => {
    const mm3 = createChroniclesState('swordhaven-first-book', null, { rules: 'mm3' });
    const tactics = createChroniclesState('swordhaven-first-book');
    expect(chroniclesApplyStartingKit(tactics, EMPTY_RUN)).toBe(tactics);
    for (const override of [
      { worldVersion: 1 },
      { worldFlags: { 'already-started': true } },
      { inventory: { 'crown-gold': { quantity: 8 } } },
      { consumedContentIds: ['already-claimed'] },
      { runStatus: 'defeated' },
    ]) {
      expect(chroniclesApplyStartingKit(mm3, { ...EMPTY_RUN, ...override })).toBe(mm3);
    }
  });

  it('selects only equipment usable by each of the ten MM3 classes', () => {
    const base = createChroniclesState('swordhaven-first-book', null, { rules: 'mm3' });
    for (const classId of Object.keys(CHRONICLES_STARTER_WEAPON_BY_CLASS)) {
      const single = { ...base, party: [{ ...base.party[0], mm3: { ...base.party[0].mm3, classId } }] };
      const state = chroniclesApplyStartingKit(single, EMPTY_RUN);
      expect(chroniclesEquippedItem(state, 'matthias', 'weapon')?.id, classId)
        .toBe(CHRONICLES_STARTER_WEAPON_BY_CLASS[classId]);
    }
  });
});
