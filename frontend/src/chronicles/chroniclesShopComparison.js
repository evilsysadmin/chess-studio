// Shop inspection is read-only: evaluate a hypothetical gear loadout against
// the exact same combat calculators used by the character sheet and battles.
// No inventory, gold, equipment or checkpoint changes occur here.
import { chroniclesPartyArmorClass, chroniclesPartyAttackStats } from '../chroniclesOfMatthias.js';
import {
  chroniclesEquippedItem,
  chroniclesEquipmentBonuses,
  chroniclesMemberCanEquip,
} from './chroniclesEquipment.js';

const STAT_LABELS = Object.freeze({
  toHit: 'Acierto',
  damage: 'Daño',
  reach: 'Alcance',
  armorClass: 'Armadura',
  damageReduction: 'Reducción',
});

function combatMetrics(state, memberId) {
  const attack = chroniclesPartyAttackStats(state, memberId);
  return {
    toHit: Number(attack.toHit || 0),
    damage: Number(attack.damage || 0),
    reach: Number(attack.reach || 0),
    armorClass: Number(chroniclesPartyArmorClass(state, memberId) || 0),
    damageReduction: Number(chroniclesEquipmentBonuses(state, memberId).damageReduction || 0),
  };
}

function previewEquipped(state, memberId, item, displacedShield) {
  const gear = { ...state.equipment?.[memberId], [item.slot]: item.id };
  if (displacedShield) delete gear.shield;
  return {
    ...state,
    equipment: { ...state.equipment, [memberId]: gear },
  };
}

export function chroniclesShopEquipmentComparisons(state, item) {
  if (!state || !item || !['weapon', 'armor', 'shield'].includes(item.slot)) return [];

  return (state.party || []).map((member) => {
    const current = chroniclesEquippedItem(state, member.id, item.slot);
    const weapon = chroniclesEquippedItem(state, member.id, 'weapon');
    const canEquip = chroniclesMemberCanEquip(member, item);
    const shieldBlocked = item.slot === 'shield' && Boolean(weapon?.twoHanded);
    const eligible = canEquip && !shieldBlocked && member.hp > 0;
    const reason = !canEquip
      ? 'Su clase no puede equiparlo'
      : shieldBlocked
        ? 'Necesita quitar antes el arma a dos manos'
        : member.hp <= 0 ? 'Fuera de combate' : null;
    const alreadyEquipped = current?.id === item.id;
    const displacedShield = item.slot === 'weapon' && item.twoHanded
      ? chroniclesEquippedItem(state, member.id, 'shield')
      : null;
    if (!eligible || alreadyEquipped) {
      return { memberId: member.id, name: member.name, current, eligible, reason, alreadyEquipped, displacedShield: null, stats: [] };
    }

    const before = combatMetrics(state, member.id);
    const after = combatMetrics(previewEquipped(state, member.id, item, displacedShield), member.id);
    const keys = item.slot === 'weapon'
      ? ['toHit', 'damage', 'reach', ...(displacedShield ? ['armorClass', 'damageReduction'] : [])]
      : ['armorClass', 'damageReduction'];

    return {
      memberId: member.id,
      name: member.name,
      current,
      eligible,
      reason: null,
      alreadyEquipped: false,
      displacedShield,
      stats: keys.map((key) => ({
        key,
        label: STAT_LABELS[key],
        before: before[key],
        after: after[key],
        delta: after[key] - before[key],
      })),
    };
  });
}
