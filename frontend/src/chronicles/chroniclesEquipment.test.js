import { describe, expect, it } from 'vitest';
import {
  chroniclesContextualContentAction,
  chroniclesPartyAttackStats,
  chroniclesReduce,
  createChroniclesState,
} from '../chroniclesOfMatthias.js';
import { chroniclesApplyContentEffects, chroniclesGoldBalance } from './chroniclesContentRuntime.js';
import {
  chroniclesEquipItem,
  chroniclesEquipmentBonuses,
  chroniclesEquippedItem,
  CHRONICLES_EQUIPMENT,
  CHRONICLES_ITEM_MATERIALS,
  chroniclesUnequipItem,
} from './chroniclesEquipment.js';
import {
  chroniclesApplyRunCheckpoint,
  chroniclesRunCheckpointPayload,
} from './chroniclesRunCheckpoint.js';

function withGold(state, amount = 30) {
  return chroniclesApplyContentEffects(state, [{ type: 'grant-gold', amount }]);
}

describe('Chronicles First Book · real purchased gear', () => {
  it('composes base items with material attributes and honest shop prices, including jewelry extension', () => {
    expect(CHRONICLES_ITEM_MATERIALS.iron).toMatchObject({
      toHit: 1, damage: 2, armorClass: 1, valueMultiplier: 2,
    });
    expect(CHRONICLES_ITEM_MATERIALS.steel).toMatchObject({
      toHit: 3, damage: 6, armorClass: 4, valueMultiplier: 10,
    });
    expect(CHRONICLES_ITEM_MATERIALS.pearl.armorClass).toBe(2);
    expect(CHRONICLES_ITEM_MATERIALS.ivory).toMatchObject({
      extension: true, armorClass: 1,
    });
    expect(CHRONICLES_EQUIPMENT['roadwatch-sabre']).toMatchObject({
      materialId: 'iron', slot: 'weapon', toHitBonus: 1,
      attackDamageBonus: 2, price: 12,
    });
    expect(CHRONICLES_EQUIPMENT['roadwatch-vest']).toMatchObject({
      materialId: 'leather', slot: 'armor', armorClassBonus: 0,
      damageReduction: 1, price: 9,
    });
  });

  it('charges gold at authored Swordhaven merchants, but a weapon in the bag grants no power', () => {
    const initial = withGold(createChroniclesState('swordhaven-first-book'), 21);
    const smith = { ...initial, x: 7, y: 4 };
    expect(chroniclesContextualContentAction(smith)?.id).toBe('first-book-weaponsmith');
    const bought = chroniclesReduce(smith, 'interact');
    expect(chroniclesGoldBalance(bought)).toBe(9);
    expect(bought.inventory['roadwatch-sabre'].quantity).toBe(1);
    expect(chroniclesPartyAttackStats(bought, 'matthias').damage).toBe(
      chroniclesPartyAttackStats(initial, 'matthias').damage,
    );
    const equipped = chroniclesReduce(bought, {
      type: 'equip-item', memberId: 'matthias', itemId: 'roadwatch-sabre',
    });
    expect(equipped.inventory).not.toHaveProperty('roadwatch-sabre');
    expect(chroniclesPartyAttackStats(equipped, 'matthias').damage).toBe(
      chroniclesPartyAttackStats(initial, 'matthias').damage + 2,
    );
    expect(chroniclesPartyAttackStats(equipped, 'rook').damage).toBe(
      chroniclesPartyAttackStats(initial, 'rook').damage,
    );
    const recovered = chroniclesApplyRunCheckpoint(
      createChroniclesState('swordhaven-first-book'),
      chroniclesRunCheckpointPayload(equipped, 4),
    );
    expect(chroniclesEquippedItem(recovered, 'matthias', 'weapon')?.id).toBe('roadwatch-sabre');
    expect(chroniclesPartyAttackStats(recovered, 'matthias').damage).toBe(
      chroniclesPartyAttackStats(initial, 'matthias').damage + 2,
    );
    expect(recovered.inventory).not.toHaveProperty('roadwatch-sabre');
    const unarmed = chroniclesUnequipItem(recovered, 'matthias', 'weapon');
    expect(unarmed.inventory['roadwatch-sabre'].quantity).toBe(1);
    expect(chroniclesPartyAttackStats(unarmed, 'matthias').damage).toBe(
      chroniclesPartyAttackStats(initial, 'matthias').damage,
    );
    expect(chroniclesUnequipItem(unarmed, 'matthias', 'weapon')).toBe(unarmed);
  });

  it('blocks duplicate ownership, missing stock, invalid item or class, and in-combat hot-swaps', () => {
    const initial = createChroniclesState('swordhaven-first-book');
    expect(chroniclesEquipItem(initial, 'matthias', 'roadwatch-sabre')).toBe(initial);
    const inventory = chroniclesApplyContentEffects(initial, [{
      type: 'grant-item', itemId: 'roadwatch-sabre', name: 'Sable de la guardia',
    }]);
    expect(chroniclesEquipItem(inventory, 'bishop', 'roadwatch-sabre')).toBe(inventory);
    expect(chroniclesEquipItem(inventory, 'unknown', 'roadwatch-sabre')).toBe(inventory);
    expect(chroniclesEquipItem(inventory, 'matthias', 'unknown')).toBe(inventory);
    const equipped = chroniclesEquipItem(inventory, 'matthias', 'roadwatch-sabre');
    expect(chroniclesEquipItem(equipped, 'matthias', 'roadwatch-sabre')).toBe(equipped);
    expect(chroniclesEquipItem(equipped, 'rook', 'roadwatch-sabre')).toBe(equipped);
    expect(chroniclesEquipItem({ ...inventory, phase: 'combat' }, 'matthias', 'roadwatch-sabre'))
      .toEqual({ ...inventory, phase: 'combat' });
    expect(chroniclesEquipItem({ ...inventory, initiative: { order: [] } }, 'matthias', 'roadwatch-sabre'))
      .toEqual({ ...inventory, initiative: { order: [] } });
  });

  it('reduces actual retaliation after equipping armor, including after F5', () => {
    let state = withGold(createChroniclesState('swordhaven-first-book'), 9);
    state = chroniclesReduce({ ...state, x: 11, y: 4 }, 'interact');
    expect(chroniclesGoldBalance(state)).toBe(0);
    expect(state.inventory['roadwatch-vest'].quantity).toBe(1);
    expect(chroniclesEquipmentBonuses(state, 'matthias').damageReduction).toBe(0);
    const worn = chroniclesEquipItem(state, 'matthias', 'roadwatch-vest');
    expect(chroniclesEquipmentBonuses(worn, 'matthias').damageReduction).toBe(1);
    expect(worn.inventory).not.toHaveProperty('roadwatch-vest');
    const from = {
      ...createChroniclesState('banner-road-first-book'),
      inventory: worn.inventory, equipment: worn.equipment,
      x: 10, y: 5, direction: 1,
    };
    const withArmor = chroniclesReduce(from, { type: 'attack', memberId: 'matthias' });
    const withoutArmor = chroniclesReduce({ ...from, equipment: {} }, { type: 'attack', memberId: 'matthias' });
    expect(withArmor.party[0].hp).toBe(withoutArmor.party[0].hp + 1);
    const reloaded = chroniclesApplyRunCheckpoint(
      createChroniclesState('banner-road-first-book'),
      chroniclesRunCheckpointPayload(from, 3),
    );
    expect(chroniclesEquipmentBonuses(reloaded, 'matthias').damageReduction).toBe(1);
    expect(reloaded.inventory).not.toHaveProperty('roadwatch-vest');
    const removed = chroniclesUnequipItem(reloaded, 'matthias', 'armor');
    expect(removed.inventory['roadwatch-vest'].quantity).toBe(1);
    expect(chroniclesEquipmentBonuses(removed, 'matthias').damageReduction).toBe(0);
  });
});
