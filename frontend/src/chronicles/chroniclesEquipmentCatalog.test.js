import { describe, expect, it } from 'vitest';
import { chroniclesPartyArmorClass, chroniclesPartyAttackStats, createChroniclesState } from '../chroniclesOfMatthias.js';
import { chroniclesApplyContentEffects } from './chroniclesContentRuntime.js';
import {
  CHRONICLES_EQUIPMENT,
  CHRONICLES_EQUIPMENT_SLOTS,
  chroniclesEquipItem,
  chroniclesEquippedItem,
} from './chroniclesEquipment.js';
import { chroniclesApplyRunCheckpoint, chroniclesRunCheckpointPayload } from './chroniclesRunCheckpoint.js';

function mm3Company(...itemIds) {
  const initial = createChroniclesState('swordhaven-first-book', null, { rules: 'mm3' });
  return chroniclesApplyContentEffects(initial, itemIds.map((itemId) => ({
    type: 'grant-item', itemId, name: CHRONICLES_EQUIPMENT[itemId].name,
  })));
}

describe('Chronicles · MM3 equipment catalog', () => {
  it('forges every base item in its materials, with three slots including the shield', () => {
    expect(CHRONICLES_EQUIPMENT_SLOTS).toEqual(['weapon', 'armor', 'shield']);
    for (const id of ['bronze-dagger', 'ivory-dagger', 'iron-sword', 'steel-axe', 'silver-mace', 'ivory-staff',
      'leather-padded', 'leather-leather', 'iron-chain', 'steel-plate', 'bronze-shield', 'ivory-shield']) {
      expect(CHRONICLES_EQUIPMENT[id], id).toBeTruthy();
    }
    // Leather never makes a blade; ivory is carved, never forged into plate.
    expect(CHRONICLES_EQUIPMENT['leather-sword']).toBeUndefined();
    expect(CHRONICLES_EQUIPMENT['ivory-plate']).toBeUndefined();
    expect(CHRONICLES_EQUIPMENT['steel-sword'].name).toBe('Espada de acero');
    // The authored First Book gear keeps its ids for saves and shops.
    expect(CHRONICLES_EQUIPMENT['roadwatch-sabre'].attackDamageBonus).toBe(2);
  });

  it('orders materials as in MM3: bronze < iron < steel in damage, armour and price', () => {
    const tiers = ['bronze', 'iron', 'steel'];
    const swords = tiers.map((m) => CHRONICLES_EQUIPMENT[`${m}-sword`]);
    const chains = tiers.map((m) => CHRONICLES_EQUIPMENT[`${m}-chain`]);
    for (let i = 1; i < tiers.length; i += 1) {
      expect(swords[i].attackDamageBonus).toBeGreaterThan(swords[i - 1].attackDamageBonus);
      expect(swords[i].price).toBeGreaterThan(swords[i - 1].price);
      expect(chains[i].armorClassBonus).toBeGreaterThan(chains[i - 1].armorClassBonus);
    }
    // MM3 quirk kept: light bronze hits easier than iron, but steel beats both.
    expect(swords[0].toHitBonus).toBeGreaterThan(swords[1].toHitBonus);
    expect(swords[2].toHitBonus).toBeGreaterThan(swords[0].toHitBonus);
    // Heavier armour protects more within one material.
    expect(CHRONICLES_EQUIPMENT['iron-plate'].armorClassBonus)
      .toBeGreaterThan(CHRONICLES_EQUIPMENT['iron-chain'].armorClassBonus);
    // No catalog weapon is worse than bare hands, and iron matches the guard's sabre.
    for (const item of Object.values(CHRONICLES_EQUIPMENT).filter((entry) => entry.slot === 'weapon')) {
      expect(item.attackDamageBonus, item.id).toBeGreaterThanOrEqual(0);
    }
    expect(CHRONICLES_EQUIPMENT['iron-sword'].attackDamageBonus)
      .toBe(CHRONICLES_EQUIPMENT['roadwatch-sabre'].attackDamageBonus);
    // A fresh company can afford bronze from one side quest; steel plate is an aspiration.
    expect(CHRONICLES_EQUIPMENT['bronze-sword'].price).toBeLessThanOrEqual(8);
    expect(CHRONICLES_EQUIPMENT['steel-plate'].price).toBeGreaterThan(300);
  });

  it('gates armour by class tier and shields by class and a free hand', () => {
    // Canonical company: matthias Caballero, rook Paladín, bishop Clérigo, knight Arquero.
    let state = mm3Company('steel-plate', 'iron-shield', 'iron-shield', 'iron-staff');
    state = chroniclesEquipItem(state, 'matthias', 'steel-plate');
    expect(chroniclesEquippedItem(state, 'matthias', 'armor')?.id).toBe('steel-plate');
    expect(chroniclesPartyArmorClass(state, 'matthias'))
      .toBe(chroniclesPartyArmorClass(mm3Company(), 'matthias') + CHRONICLES_EQUIPMENT['steel-plate'].armorClassBonus);
    // The archer may not carry a shield.
    const archer = chroniclesEquipItem(state, 'knight', 'iron-shield');
    expect(chroniclesEquippedItem(archer, 'knight', 'shield')).toBeNull();
    expect(archer.message).toMatch(/Arquero/);
    // The knight raises a shield, then takes up a two-handed staff: the shield goes back to the pack.
    state = chroniclesEquipItem(state, 'matthias', 'iron-shield');
    expect(chroniclesEquippedItem(state, 'matthias', 'shield')?.id).toBe('iron-shield');
    const shieldCount = state.inventory['iron-shield'].quantity;
    state = chroniclesEquipItem(state, 'matthias', 'iron-staff');
    expect(chroniclesEquippedItem(state, 'matthias', 'shield')).toBeNull();
    expect(state.inventory['iron-shield'].quantity).toBe(shieldCount + 1);
    expect(state.message).toMatch(/vuelve a la mochila/);
    // …and with a two-handed weapon in hand, the shield is refused.
    const refused = chroniclesEquipItem(state, 'matthias', 'iron-shield');
    expect(chroniclesEquippedItem(refused, 'matthias', 'shield')).toBeNull();
    expect(refused.message).toMatch(/mano libre/);
  });

  it('turns material into real to-hit and damage, and survives a checkpoint with class rules', () => {
    let state = mm3Company('steel-sword', 'bronze-shield');
    const before = chroniclesPartyAttackStats(state, 'rook');
    state = chroniclesEquipItem(state, 'rook', 'steel-sword');
    state = chroniclesEquipItem(state, 'rook', 'bronze-shield');
    const after = chroniclesPartyAttackStats(state, 'rook');
    expect(after.toHit).toBe(before.toHit + CHRONICLES_EQUIPMENT['steel-sword'].toHitBonus);
    expect(after.damage).toBe(before.damage + CHRONICLES_EQUIPMENT['steel-sword'].attackDamageBonus);

    const restored = chroniclesApplyRunCheckpoint(
      createChroniclesState('swordhaven-first-book', null, { rules: 'mm3' }),
      chroniclesRunCheckpointPayload(state, 4),
    );
    expect(chroniclesEquippedItem(restored, 'rook', 'weapon')?.id).toBe('steel-sword');
    expect(chroniclesEquippedItem(restored, 'rook', 'shield')?.id).toBe('bronze-shield');
  });
});
