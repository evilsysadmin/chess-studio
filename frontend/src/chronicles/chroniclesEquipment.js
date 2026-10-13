// First Book equipment is a party-run possession, never a passive bonus
// from the bag. Wearing/holding an item removes exactly one copy from the
// shared inventory; unequipping returns it. All mutations are checkpointed.
// MM3-style item materials: material changes combat and merchant value,
// not merely the name. Canonical values follow the MM3 materials tables.
// Ivory is an authored-world extension, not an original MM3 material row.
import { CHRONICLES_MM3_ARMOR_TIERS, chroniclesMM3Class } from './chroniclesMM3Rules.js';

export const CHRONICLES_ITEM_MATERIALS = Object.freeze({
  // Starter junk. Wood and brass sit below bronze as in MM3's ladder; their
  // exact canonical rows were not verifiable, so they are marked approximate.
  wooden: Object.freeze({ name: 'madera', toHit: -1, damage: -3, armorClass: 0, valueMultiplier: 0.2, tier: 0, approximate: true }),
  brass: Object.freeze({ name: 'latón', toHit: 1, damage: -2, armorClass: 0, valueMultiplier: 0.5, tier: 0, approximate: true }),
  leather: Object.freeze({ name: 'cuero', toHit: -4, damage: -6, armorClass: 0, valueMultiplier: 0.25, tier: 0 }),
  bronze: Object.freeze({ name: 'bronce', toHit: 2, damage: -2, armorClass: -1, valueMultiplier: 0.75, tier: 1 }),
  iron: Object.freeze({ name: 'hierro', toHit: 1, damage: 2, armorClass: 1, valueMultiplier: 2, tier: 2 }),
  silver: Object.freeze({ name: 'plata', toHit: 2, damage: 4, armorClass: 2, valueMultiplier: 5, tier: 2 }),
  steel: Object.freeze({ name: 'acero', toHit: 3, damage: 6, armorClass: 4, valueMultiplier: 10, tier: 3 }),
  pearl: Object.freeze({ name: 'perla', toHit: 2, damage: 2, armorClass: 2, valueMultiplier: 20, tier: 2 }),
  // The user-requested ivory necklace family belongs to our extension catalog.
  ivory: Object.freeze({ name: 'marfil', toHit: 1, damage: 1, armorClass: 1, valueMultiplier: 3, tier: 2, extension: true }),
});

function authoredEquipment(spec) {
  const material = CHRONICLES_ITEM_MATERIALS[spec.materialId];
  if (!material) throw new Error(`Unknown Chronicles equipment material: ${spec.materialId}`);
  const weapon = spec.slot === 'weapon';
  return Object.freeze({
    ...spec,
    // Catalog weapons apply half the MM3 material damage: this world's base
    // damage is a few points, so the raw table (steel +6) would one-shot.
    attackDamageBonus: spec.baseDamageBonus
      + (weapon ? Math.round(material.damage * (spec.materialDamageScale ?? 1)) : 0),
    // Existing First Book mitigation is an interim, deterministic defense
    // effect. MM3's material armorClass remains explicit for proper AC later.
    damageReduction: spec.baseDamageReduction,
    toHitBonus: weapon ? material.toHit : 0,
    // MM armor class: the armor type's own AC plus its material.
    armorClassBonus: !weapon ? Math.max(0, Number(spec.baseArmorClass || 0) + material.armorClass) : 0,
    price: Math.max(1, Math.round(spec.basePrice * material.valueMultiplier)),
    // Progression tier: 0 starter junk (wood, brass, leather), 1 bronze,
    // 2 iron/silver/ivory/pearl, 3 steel. Towns and loot tables gate by it.
    tier: material.tier,
  });
}

const LEGACY_FRONT = Object.freeze(['matthias', 'rook']);
const LEGACY_MARTIAL = Object.freeze(['matthias', 'rook', 'knight']);
const LEGACY_ALL = Object.freeze(['matthias', 'rook', 'bishop', 'knight']);

// MM3-style base items. Prices are scaled to this world's purses (a side
// quest pays 8–18 oro); the material multiplier does the rest, so steel is
// an aspiration and bronze is what a fresh company can afford.
const BASE_WEAPONS = Object.freeze({
  dagger: { name: 'Daga', family: 'dagger', basePrice: 2, baseDamageBonus: 1, allowed: LEGACY_ALL },
  staff: { name: 'Bastón', family: 'staff', basePrice: 3, baseDamageBonus: 1, twoHanded: true, allowed: LEGACY_ALL },
  mace: { name: 'Maza', family: 'mace', basePrice: 5, baseDamageBonus: 1, allowed: LEGACY_ALL },
  spear: { name: 'Lanza', family: 'spear', basePrice: 5, baseDamageBonus: 2, twoHanded: true, allowed: LEGACY_MARTIAL },
  sword: { name: 'Espada', family: 'sword', basePrice: 6, baseDamageBonus: 1, allowed: LEGACY_MARTIAL },
  axe: { name: 'Hacha', family: 'axe', basePrice: 7, baseDamageBonus: 2, allowed: LEGACY_MARTIAL },
  bow: { name: 'Arco corto', family: 'bow', basePrice: 8, baseDamageBonus: 3, twoHanded: true, reach: 3, allowed: LEGACY_ALL },
});

const BASE_ARMORS = Object.freeze({
  padded: { name: 'Gambesón', armorType: 'padded', basePrice: 6, baseArmorClass: 1, baseDamageReduction: 1, allowed: LEGACY_ALL },
  leather: { name: 'Coraza', armorType: 'leather', basePrice: 9, baseArmorClass: 2, baseDamageReduction: 1, allowed: LEGACY_ALL },
  scale: { name: 'Cota de escamas', armorType: 'scale', basePrice: 14, baseArmorClass: 3, baseDamageReduction: 1, allowed: LEGACY_FRONT },
  ring: { name: 'Cota de anillas', armorType: 'ring', basePrice: 18, baseArmorClass: 4, baseDamageReduction: 2, allowed: LEGACY_FRONT },
  chain: { name: 'Cota de malla', armorType: 'chain', basePrice: 24, baseArmorClass: 5, baseDamageReduction: 2, allowed: LEGACY_FRONT },
  splint: { name: 'Armadura de bandas', armorType: 'splint', basePrice: 32, baseArmorClass: 6, baseDamageReduction: 2, allowed: LEGACY_FRONT },
  plate: { name: 'Armadura de placas', armorType: 'plate', basePrice: 45, baseArmorClass: 7, baseDamageReduction: 3, allowed: LEGACY_FRONT },
});

// Which materials each base item is forged in. Leather only makes soft
// armour; ivory (our extension) is carved into daggers, staves and shields.
const WEAPON_MATERIALS = Object.freeze(['brass', 'bronze', 'iron', 'silver', 'steel']);
// Wood makes staves, clubs (wooden maces) and spears; ivory is carved.
const WOODEN_WEAPONS = Object.freeze(['staff', 'mace', 'spear', 'bow']);
const CARVED_MATERIALS = Object.freeze(['ivory']);
const SOFT_ARMOR_MATERIALS = Object.freeze(['leather', 'bronze', 'iron', 'steel']);
const METAL_ARMOR_MATERIALS = Object.freeze(['brass', 'bronze', 'iron', 'silver', 'steel']);
const SHIELD_MATERIALS = Object.freeze(['wooden', 'brass', 'bronze', 'iron', 'silver', 'steel', 'ivory']);

// «Espada de acero», «Bastón de marfil»: Spanish material phrases are
// genderless, so the base name always goes first.
function materialName(materialId) {
  return CHRONICLES_ITEM_MATERIALS[materialId].name;
}

function signed(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function weaponItem(baseId, materialId) {
  const base = BASE_WEAPONS[baseId];
  const material = CHRONICLES_ITEM_MATERIALS[materialId];
  const damage = base.baseDamageBonus + Math.round(material.damage / 2);
  return authoredEquipment({
    id: `${materialId}-${baseId}`, name: `${base.name} de ${materialName(materialId)}`, slot: 'weapon',
    baseItemId: baseId, materialId, basePrice: base.basePrice,
    baseDamageBonus: base.baseDamageBonus, baseDamageReduction: 0, materialDamageScale: 0.5,
    weaponFamily: base.family, twoHanded: Boolean(base.twoHanded),
    reach: Number(base.reach || 1),
    allowedMembers: base.allowed,
    description: `${base.name}${base.twoHanded ? ' a dos manos' : ''} · acierto ${signed(material.toHit)}, daño ${signed(damage)}.`,
  });
}

function armorItem(baseId, materialId) {
  const base = BASE_ARMORS[baseId];
  const material = CHRONICLES_ITEM_MATERIALS[materialId];
  return authoredEquipment({
    id: `${materialId}-${baseId}`, name: `${base.name} de ${materialName(materialId)}`, slot: 'armor',
    baseItemId: baseId, materialId, basePrice: base.basePrice,
    baseDamageBonus: 0, baseDamageReduction: base.baseDamageReduction,
    armorType: base.armorType, baseArmorClass: base.baseArmorClass,
    allowedMembers: base.allowed,
    description: `${base.name} · armadura +${Math.max(0, base.baseArmorClass + material.armorClass)}.`,
  });
}

function shieldItem(materialId) {
  const material = CHRONICLES_ITEM_MATERIALS[materialId];
  return authoredEquipment({
    id: `${materialId}-shield`, name: `Escudo de ${materialName(materialId)}`, slot: 'shield',
    baseItemId: 'shield', materialId, basePrice: 8,
    baseDamageBonus: 0, baseDamageReduction: 1,
    baseArmorClass: 1,
    allowedMembers: LEGACY_FRONT,
    description: `Escudo · armadura +${Math.max(0, 1 + material.armorClass)}. Sólo clases con escudo y una mano libre.`,
  });
}

function catalog() {
  const items = {
    // Authored First Book gear keeps its ids: saves and shops reference them.
    'roadwatch-sabre': authoredEquipment({
      id: 'roadwatch-sabre', name: 'Sable de hierro de la guardia', slot: 'weapon',
      baseItemId: 'sabre', materialId: 'iron', basePrice: 6,
      baseDamageBonus: 0, baseDamageReduction: 0,
      weaponFamily: 'sword',
      allowedMembers: LEGACY_FRONT,
      description: 'Espada de hierro · +1 acierto, +2 daño. Caballero, Paladín, Arquero, Ladrón o Ninja.',
    }),
    'roadwatch-vest': authoredEquipment({
      id: 'roadwatch-vest', name: 'Jubón de cuero de guardia', slot: 'armor',
      baseItemId: 'vest', materialId: 'leather', basePrice: 36,
      baseDamageBonus: 0, baseDamageReduction: 1,
      armorType: 'leather', baseArmorClass: 2,
      allowedMembers: LEGACY_ALL,
      description: 'Armadura de cuero · +2 armadura. Cualquier clase salvo Hechicero.',
    }),
  };
  for (const baseId of Object.keys(BASE_WEAPONS)) {
    const carved = baseId === 'dagger' || baseId === 'staff' ? CARVED_MATERIALS : [];
    const wooden = WOODEN_WEAPONS.includes(baseId) ? ['wooden'] : [];
    // Wooden bows are real bows, not a fictitious solid brass/steel bow.
    const forged = baseId === 'bow' ? [] : WEAPON_MATERIALS;
    for (const materialId of [...wooden, ...forged, ...carved]) {
      items[`${materialId}-${baseId}`] = weaponItem(baseId, materialId);
    }
  }
  for (const baseId of Object.keys(BASE_ARMORS)) {
    const soft = baseId === 'padded' || baseId === 'leather';
    for (const materialId of soft ? SOFT_ARMOR_MATERIALS : METAL_ARMOR_MATERIALS) {
      items[`${materialId}-${baseId}`] = armorItem(baseId, materialId);
    }
  }
  for (const materialId of SHIELD_MATERIALS) items[`${materialId}-shield`] = shieldItem(materialId);
  return Object.freeze(items);
}

export const CHRONICLES_EQUIPMENT = catalog();

export const CHRONICLES_EQUIPMENT_SLOTS = Object.freeze(['weapon', 'armor', 'shield']);

function stock(state) {
  return state?.inventory && typeof state.inventory === 'object' && !Array.isArray(state.inventory)
    ? state.inventory : {};
}

// Under MM rules the hero's class decides what they may wield or wear;
// parties without a class sheet keep the authored per-hero allow-list.
export function chroniclesMemberCanEquip(member, item) {
  if (!member || !item) return false;
  const definition = chroniclesMM3Class(member.mm3?.classId);
  if (!definition) return item.allowedMembers.includes(member.id);
  if (item.slot === 'weapon') return definition.weapons.includes(item.weaponFamily);
  if (item.slot === 'armor') return definition.maxArmorTier >= (CHRONICLES_MM3_ARMOR_TIERS[item.armorType] ?? 0);
  if (item.slot === 'shield') return definition.shield === true;
  return false;
}

function memberById(state, memberId) {
  return state?.party?.find((person) => person.id === memberId) || { id: memberId };
}

function equippedId(state, memberId, slot) {
  if (!CHRONICLES_EQUIPMENT_SLOTS.includes(slot)) return null;
  const id = state?.equipment?.[memberId]?.[slot];
  const item = CHRONICLES_EQUIPMENT[id];
  return item?.slot === slot && chroniclesMemberCanEquip(memberById(state, memberId), item) ? id : null;
}

export function chroniclesEquippedItem(state, memberId, slot) {
  return CHRONICLES_EQUIPMENT[equippedId(state, memberId, slot)] || null;
}

export function chroniclesEquipmentBonuses(state, memberId) {
  const items = CHRONICLES_EQUIPMENT_SLOTS
    .map((slot) => chroniclesEquippedItem(state, memberId, slot))
    .filter(Boolean);
  return {
    attackDamageBonus: items.reduce((sum, item) => sum + item.attackDamageBonus, 0),
    damageReduction: items.reduce((sum, item) => sum + item.damageReduction, 0),
    toHitBonus: items.reduce((sum, item) => sum + item.toHitBonus, 0),
    armorClassBonus: items.reduce((sum, item) => sum + item.armorClassBonus, 0),
  };
}

function inventoryQuantity(inventory, id) {
  const quantity = inventory[id]?.quantity;
  return Number.isSafeInteger(quantity) && quantity >= 0 ? quantity : 0;
}

function putBack(inventory, item) {
  const current = inventoryQuantity(inventory, item.id);
  if (current >= 9999) return null;
  return {
    ...inventory,
    [item.id]: {
      id: item.id, name: item.name, description: item.description,
      quantity: current + 1,
    },
  };
}

export function chroniclesEquipItem(state, memberId, itemId) {
  if (!state || state.phase !== 'explore' || state.initiative) return state;
  const member = state.party?.find((person) => person.id === memberId && person.hp > 0);
  const item = CHRONICLES_EQUIPMENT[itemId];
  if (!member || !item) return state;
  if (!chroniclesMemberCanEquip(member, item)) {
    const classLabel = chroniclesMM3Class(member.mm3?.classId)?.label;
    return {
      ...state,
      message: classLabel
        ? `${member.name} (${classLabel}) no puede usar ${item.name}: su clase no lo permite.`
        : `${member.name} no puede usar ${item.name}.`,
    };
  }
  const inventory = stock(state);
  const count = inventoryQuantity(inventory, item.id);
  if (count < 1 || equippedId(state, memberId, item.slot) === item.id) return state;
  // A shield needs a free hand: no shield beside a two-handed weapon.
  if (item.slot === 'shield' && chroniclesEquippedItem(state, memberId, 'weapon')?.twoHanded) {
    return { ...state, message: `${member.name} necesita una mano libre para el escudo.` };
  }
  const existing = chroniclesEquippedItem(state, memberId, item.slot);
  // Taking up a two-handed weapon stows the shield in the shared pack.
  const displacedShield = item.twoHanded ? chroniclesEquippedItem(state, memberId, 'shield') : null;
  let nextInventory = { ...inventory };
  if (count === 1) delete nextInventory[item.id];
  else nextInventory[item.id] = { ...inventory[item.id], quantity: count - 1 };
  for (const returned of [existing, displacedShield].filter(Boolean)) {
    nextInventory = putBack(nextInventory, returned);
    if (!nextInventory) return state;
  }
  const memberEquipment = { ...state.equipment?.[memberId], [item.slot]: item.id };
  if (displacedShield) delete memberEquipment.shield;
  return {
    ...state,
    inventory: nextInventory,
    equipment: { ...state.equipment, [memberId]: memberEquipment },
    message: `${member.name} equipa ${item.name}. ${item.description}`
      + (displacedShield ? ` ${displacedShield.name} vuelve a la mochila.` : ''),
  };
}

export function chroniclesUnequipItem(state, memberId, slot) {
  if (!state || state.phase !== 'explore' || state.initiative) return state;
  const member = state.party?.find((person) => person.id === memberId && person.hp > 0);
  const item = chroniclesEquippedItem(state, memberId, slot);
  if (!member || !item) return state;
  const inventory = putBack(stock(state), item);
  if (!inventory) return state;
  const currentEquipment = { ...state.equipment?.[memberId] };
  delete currentEquipment[slot];
  return {
    ...state, inventory,
    equipment: { ...state.equipment, [memberId]: currentEquipment },
    message: `${member.name} guarda ${item.name} en la mochila.`,
  };
}
