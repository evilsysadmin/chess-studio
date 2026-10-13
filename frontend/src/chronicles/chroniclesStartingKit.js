// A real (but modest) MM3-style starting company. Grant only when the
// authoritative server reports a pristine first-person run (worldVersion 0).
// Once a checkpoint exists, its inventory and equipped slots are authoritative.
import { CHRONICLES_GOLD_ITEM_ID } from './chroniclesContentRuntime.js';
import { CHRONICLES_EQUIPMENT, chroniclesMemberCanEquip } from './chroniclesEquipment.js';

export const CHRONICLES_STARTING_GOLD = 40;

export const CHRONICLES_STARTER_WEAPON_BY_CLASS = Object.freeze({
  knight: 'bronze-sword',
  paladin: 'bronze-mace',
  cleric: 'bronze-mace',
  archer: 'wooden-bow',
  sorcerer: 'wooden-staff',
  robber: 'bronze-dagger',
  ninja: 'bronze-dagger',
  barbarian: 'bronze-axe',
  druid: 'wooden-staff',
  ranger: 'wooden-bow',
});

export function chroniclesApplyStartingKit(state, run) {
  if (state?.combatRules !== 'mm3' || !Array.isArray(state.party)
    || run?.worldVersion !== 0 || (run.runStatus || run.status || 'active') !== 'active'
    || Object.keys(run?.worldFlags || {}).length
    || Object.keys(run?.inventory || {}).length
    || (run?.claimedRewards || []).length || (run?.consumedContentIds || []).length
    || Object.keys(state.inventory || {}).length || Object.keys(state.equipment || {}).length) {
    return state;
  }

  const equipment = {};
  for (const member of state.party) {
    const itemId = CHRONICLES_STARTER_WEAPON_BY_CLASS[member.mm3?.classId];
    const item = CHRONICLES_EQUIPMENT[itemId];
    if (!item || !chroniclesMemberCanEquip(member, item)) continue;
    equipment[member.id] = { weapon: item.id };
  }

  return {
    ...state,
    equipment,
    inventory: {
      [CHRONICLES_GOLD_ITEM_ID]: {
        id: CHRONICLES_GOLD_ITEM_ID,
        name: 'Oro',
        description: 'Monedas de la bolsa común de la compañía.',
        quantity: CHRONICLES_STARTING_GOLD,
      },
    },
  };
}
