// First Book equipment is a party-run possession, never a passive bonus
// from the bag. Wearing/holding an item removes exactly one copy from the
// shared inventory; unequipping returns it. All mutations are checkpointed.
// MM3-style item materials: material changes combat and merchant value,
// not merely the name. Canonical values follow the MM3 materials tables.
// Ivory is an authored-world extension, not an original MM3 material row.
export const CHRONICLES_ITEM_MATERIALS = Object.freeze({
  leather: Object.freeze({ name: 'cuero', toHit: -4, damage: -6, armorClass: 0, valueMultiplier: 0.25, tier: 1 }),
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
    attackDamageBonus: spec.baseDamageBonus + (weapon ? material.damage : 0),
    // Existing First Book mitigation is an interim, deterministic defense
    // effect. MM3's material armorClass remains explicit for proper AC later.
    damageReduction: spec.baseDamageReduction,
    toHitBonus: weapon ? material.toHit : 0,
    armorClassBonus: !weapon ? material.armorClass : 0,
    price: Math.max(1, Math.round(spec.basePrice * material.valueMultiplier)),
  });
}

export const CHRONICLES_EQUIPMENT = Object.freeze({
  'roadwatch-sabre': authoredEquipment({
    id: 'roadwatch-sabre', name: 'Sable de hierro de la guardia', slot: 'weapon',
    baseItemId: 'sabre', materialId: 'iron', basePrice: 6,
    baseDamageBonus: 0, baseDamageReduction: 0,
    allowedMembers: Object.freeze(['matthias', 'rook']),
    description: 'Hierro · +1 acierto, +2 daño equipado, precio ×2.',
  }),
  'roadwatch-vest': authoredEquipment({
    id: 'roadwatch-vest', name: 'Jubón de cuero de guardia', slot: 'armor',
    baseItemId: 'vest', materialId: 'leather', basePrice: 36,
    baseDamageBonus: 0, baseDamageReduction: 1,
    allowedMembers: Object.freeze(['matthias', 'rook', 'bishop', 'knight']),
    description: 'Cuero · defensa base: -1 daño recibido; material sin bono AC.',
  }),
});

export const CHRONICLES_EQUIPMENT_SLOTS = Object.freeze(['weapon', 'armor']);

function stock(state) {
  return state?.inventory && typeof state.inventory === 'object' && !Array.isArray(state.inventory)
    ? state.inventory : {};
}

function equippedId(state, memberId, slot) {
  if (!CHRONICLES_EQUIPMENT_SLOTS.includes(slot)) return null;
  const id = state?.equipment?.[memberId]?.[slot];
  const item = CHRONICLES_EQUIPMENT[id];
  return item?.slot === slot && item.allowedMembers.includes(memberId) ? id : null;
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
  if (!member || !item || !item.allowedMembers.includes(memberId)) return state;
  const inventory = stock(state);
  const count = inventoryQuantity(inventory, item.id);
  if (count < 1 || equippedId(state, memberId, item.slot) === item.id) return state;
  const existing = chroniclesEquippedItem(state, memberId, item.slot);
  if (existing && inventoryQuantity(inventory, existing.id) >= 9999) return state;
  let nextInventory = { ...inventory };
  if (count === 1) delete nextInventory[item.id];
  else nextInventory[item.id] = { ...inventory[item.id], quantity: count - 1 };
  if (existing) nextInventory = putBack(nextInventory, existing);
  return {
    ...state,
    inventory: nextInventory,
    equipment: {
      ...state.equipment,
      [memberId]: { ...state.equipment?.[memberId], [item.slot]: item.id },
    },
    message: `${member.name} equipa ${item.name}. ${item.description}`,
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
