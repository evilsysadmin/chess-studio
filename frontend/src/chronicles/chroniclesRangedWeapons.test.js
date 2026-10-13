import { describe, expect, it } from 'vitest';
import { chroniclesPartyAttackStats, chroniclesReduce, createChroniclesState } from '../chroniclesOfMatthias.js';
import { chroniclesApplyContentEffects } from './chroniclesContentRuntime.js';
import {
  CHRONICLES_EQUIPMENT,
  chroniclesEquipItem,
  chroniclesEquippedItem,
} from './chroniclesEquipment.js';
import { chroniclesMapById } from './chroniclesMapCatalog.js';
import {
  chroniclesEnemyCanAttackParty,
  chroniclesResolveEnemyActor,
} from '../chroniclesOfMatthiasTurns.js';
import { chroniclesApplyRunCheckpoint, chroniclesRunCheckpointPayload } from './chroniclesRunCheckpoint.js';

function give(state, itemId) {
  return chroniclesApplyContentEffects(state, [{
    type: 'grant-item', itemId, name: CHRONICLES_EQUIPMENT[itemId].name,
  }]);
}

describe('Chronicles ranged combat', () => {
  it('lets eligible classes equip bows and crossbows while preserving two-handed shield rules and saves', () => {
    let state = createChroniclesState('swordhaven-first-book', null, { rules: 'mm3' });
    state = give(give(give(state, 'wooden-bow'), 'wooden-crossbow'), 'wooden-shield');
    expect(CHRONICLES_EQUIPMENT['wooden-bow']).toMatchObject({ attackReach: 5, projectile: 'arrow', twoHanded: true });
    expect(CHRONICLES_EQUIPMENT['wooden-crossbow']).toMatchObject({ attackReach: 4, projectile: 'bolt', twoHanded: true });
    expect(chroniclesEquipItem(state, 'bishop', 'wooden-bow').equipment).toBe(state.equipment);
    state = chroniclesEquipItem(state, 'matthias', 'wooden-shield');
    expect(chroniclesEquippedItem(state, 'matthias', 'shield')).toBeTruthy();
    state = chroniclesEquipItem(state, 'matthias', 'wooden-crossbow');
    expect(chroniclesEquippedItem(state, 'matthias', 'shield')).toBeNull();
    expect(chroniclesPartyAttackStats(state, 'matthias')).toMatchObject({
      reach: 4, projectile: 'bolt', attackLabel: 'Ballesta de madera',
    });
    state = chroniclesEquipItem(state, 'knight', 'wooden-bow');
    expect(chroniclesPartyAttackStats(state, 'knight').reach).toBe(5);
    const saved = chroniclesApplyRunCheckpoint(
      createChroniclesState('swordhaven-first-book', null, { rules: 'mm3' }),
      chroniclesRunCheckpointPayload(state, 5),
    );
    expect(chroniclesEquippedItem(saved, 'knight', 'weapon')?.id).toBe('wooden-bow');
    expect(chroniclesPartyAttackStats(saved, 'knight').reach).toBe(5);
  });

  it('shoots from range only when the weapon is equipped, and walls block projectiles', () => {
    let state = createChroniclesState('banner-road-first-book');
    state = give(state, 'wooden-bow');
    const line = { ...state, x: 11, y: 8, direction: 0 };
    const unarmed = chroniclesReduce(line, { type: 'attack', memberId: 'knight' });
    expect(unarmed.bannerRoadDeserterHp).toBe(line.bannerRoadDeserterHp);
    const armed = chroniclesEquipItem(state, 'knight', 'wooden-bow');
    const aimed = { ...armed, x: 11, y: 8, direction: 0 };
    const struck = chroniclesReduce(aimed, { type: 'attack', memberId: 'knight' });
    expect(struck.bannerRoadDeserterHp).toBeLessThan(aimed.bannerRoadDeserterHp);
    const blocked = { ...armed, x: 11, y: 2, direction: 2 };
    const againstWall = chroniclesReduce(blocked, { type: 'attack', memberId: 'knight' });
    expect(againstWall.bannerRoadDeserterHp).toBe(blocked.bannerRoadDeserterHp);
  });

  it('gives ranged attacks to authored shooters but keeps beasts and common goblins melee-only', () => {
    const map = chroniclesMapById('swordhaven-sewers');
    const smuggler = map.enemies.find((enemy) => enemy.id === 'sewers-smuggler');
    const spider = map.enemies.find((enemy) => enemy.id === 'sewers-spider');
    const goblin = map.enemies.find((enemy) => enemy.id === 'sewers-goblin-west');
    expect(smuggler).toMatchObject({ rangedWeapon: 'crossbow', ai: { requiresLineOfSight: true, attackReach: 4 } });
    expect(spider.ai.attackReach).toBe(1);
    expect(goblin.ai.attackReach).toBe(1);
    const clear = { ...createChroniclesState('swordhaven-sewers'), x: 9, y: 9 };
    expect(chroniclesEnemyCanAttackParty(clear, smuggler)).toBe(true);
    const fired = chroniclesResolveEnemyActor(clear, smuggler.id);
    expect(fired.enemyTurnEvents).toEqual([expect.objectContaining({
      type: 'attack', enemyId: smuggler.id, projectile: 'crossbow',
    })]);
    const hidden = { ...clear, x: 7, y: 9 };
    expect(chroniclesEnemyCanAttackParty(hidden, smuggler)).toBe(false);
  });

  it('authoring selects shooters explicitly, never implicitly by visual enemy species', () => {
    const road = chroniclesMapById('banner-road-first-book');
    const deserter = road.enemies.find((enemy) => enemy.id === 'banner-road-deserter');
    expect(deserter.rangedWeapon).toBe('bow');
    expect(deserter.ai).toMatchObject({ attackReach: 4, requiresLineOfSight: true, disengageRange: 1 });
  });
});
