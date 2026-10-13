import { describe, expect, it } from 'vitest';
import { chroniclesPartyArmorClass, chroniclesPartyAttackStats, createChroniclesState } from '../chroniclesOfMatthias.js';
import { CHRONICLES_EQUIPMENT } from './chroniclesEquipment.js';
import { chroniclesShopEquipmentComparisons } from './chroniclesShopComparison.js';

const item = (id) => CHRONICLES_EQUIPMENT[id];
const memberPreview = (state, id, next) =>
  chroniclesShopEquipmentComparisons(state, item(next)).find((entry) => entry.memberId === id);
const metric = (entry, key) => entry.stats.find((stat) => stat.key === key);

describe('Chronicles shop · preview equipment against party', () => {
  const initial = () => createChroniclesState('swordhaven-first-book', null, { rules: 'mm3' });

  it('compares a weapon against each hero’s equipped gear using actual combat statistics', () => {
    const base = initial();
    const state = {
      ...base,
      equipment: {
        matthias: { weapon: 'bronze-sword' },
        rook: { weapon: 'wooden-mace' },
        bishop: { weapon: 'wooden-staff' },
        knight: { weapon: 'wooden-bow' },
      },
    };
    const next = memberPreview(state, 'matthias', 'brass-mace');
    expect(next.eligible).toBe(true);
    expect(next.current?.name).toBe(item('bronze-sword').name);
    expect(metric(next, 'toHit').before).toBe(chroniclesPartyAttackStats(state, 'matthias').toHit);
    expect(metric(next, 'damage').after).toBe(chroniclesPartyAttackStats({
      ...state, equipment: { ...state.equipment, matthias: { weapon: 'brass-mace' } },
    }, 'matthias').damage);
    expect(metric(next, 'damage').delta).toBe(metric(next, 'damage').after - metric(next, 'damage').before);
    expect(memberPreview(state, 'bishop', 'brass-sword')).toMatchObject({
      eligible: false,
      reason: 'Su clase no puede equiparlo',
      stats: [],
    });
    // The preview must not buy/equip, modify gold, or change the original state.
    expect(state.equipment.matthias.weapon).toBe('bronze-sword');
    expect(state.inventory).toEqual(base.inventory);
  });

  it('warns about shields displaced by two-handed weapons and includes defensive losses', () => {
    const state = {
      ...initial(),
      equipment: { matthias: { weapon: 'bronze-sword', shield: 'iron-shield' } },
    };
    const next = memberPreview(state, 'matthias', 'wooden-staff');
    expect(next.eligible).toBe(true);
    expect(next.displacedShield?.id).toBe('iron-shield');
    expect(metric(next, 'armorClass').before).toBe(chroniclesPartyArmorClass(state, 'matthias'));
    expect(metric(next, 'armorClass').delta).toBeLessThan(0);
    expect(metric(next, 'damageReduction').delta).toBeLessThan(0);
    expect(state.equipment.matthias.shield).toBe('iron-shield');
  });

  it('blocks the shield comparison while wielding two hands, as the equip action does', () => {
    const state = {
      ...initial(), equipment: { matthias: { weapon: 'wooden-staff' } },
    };
    const next = memberPreview(state, 'matthias', 'brass-shield');
    expect(next.eligible).toBe(false);
    expect(next.reason).toMatch(/dos manos/);
    expect(next.stats).toEqual([]);
  });

  it('shows real armor and damage reduction deltas, including when the slot is empty', () => {
    const state = initial();
    const next = memberPreview(state, 'matthias', 'leather-padded');
    expect(next.current).toBeNull();
    expect(next.eligible).toBe(true);
    expect(next.stats.map((stat) => stat.key)).toEqual(['armorClass', 'damageReduction']);
    expect(metric(next, 'armorClass').delta).toBe(item('leather-padded').armorClassBonus);
    expect(metric(next, 'damageReduction').delta).toBe(item('leather-padded').damageReduction);
  });

  it('handles already equipped, fallen and malformed previews without side effects', () => {
    const base = initial();
    const state = { ...base, equipment: { matthias: { weapon: 'brass-mace' } } };
    expect(memberPreview(state, 'matthias', 'brass-mace')).toMatchObject({
      alreadyEquipped: true, eligible: true, stats: [],
    });
    const fallen = { ...state, party: state.party.map((hero) => hero.id === 'matthias' ? { ...hero, hp: 0 } : hero) };
    expect(memberPreview(fallen, 'matthias', 'brass-mace').eligible).toBe(false);
    expect(chroniclesShopEquipmentComparisons(null, item('brass-mace'))).toEqual([]);
    expect(chroniclesShopEquipmentComparisons(state, null)).toEqual([]);
  });
});
