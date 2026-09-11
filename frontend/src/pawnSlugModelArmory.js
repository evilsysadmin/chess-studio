import { PAWN_SLUG_LIVE_WEAPON_MODELS } from './pawnSlugLiveWeaponModels.js';
import { pawnSlugWeaponModel } from './pawnSlugWeaponModels.js';

const offer = (modelId, cost) => Object.freeze({ modelId, cost });

export const PAWN_SLUG_MODEL_ARMORY = Object.freeze({
  pistol: Object.freeze([
    offer('glock17', 45),
    offer('dienstpistole', 0),
    offer('desert-eagle', 70),
  ]),
  machinegun: Object.freeze([
    offer('m249', 70),
    offer('mg42', 0),
    offer('rpk', 65),
  ]),
  shotgun: Object.freeze([
    offer('m3-super90', 0),
    offer('m870', 55),
    offer('spas12', 75),
  ]),
  panzerfaust: Object.freeze([
    offer('m79', 85),
    offer('rpg7', 110),
    offer('panzerfaust', 0),
  ]),
});

function bindingFor(weaponId) {
  return PAWN_SLUG_LIVE_WEAPON_MODELS[weaponId] || PAWN_SLUG_LIVE_WEAPON_MODELS.pistol;
}

function validModel(weaponId, modelId) {
  const binding = bindingFor(weaponId);
  return Boolean(pawnSlugWeaponModel(binding.family, modelId)?.id === modelId);
}

function defaults() {
  return Object.fromEntries(Object.entries(PAWN_SLUG_LIVE_WEAPON_MODELS).map(([weaponId, binding]) => [
    weaponId,
    Object.freeze({
      selected: binding.modelId,
      owned: Object.freeze([binding.modelId]),
    }),
  ]));
}

export function createPawnSlugModelArmoryState(seed = {}) {
  const base = defaults();
  const slots = {};
  for (const weaponId of Object.keys(PAWN_SLUG_LIVE_WEAPON_MODELS)) {
    const fallback = base[weaponId];
    const incoming = seed[weaponId] || {};
    const owned = new Set(fallback.owned);
    for (const modelId of incoming.owned || []) {
      if (validModel(weaponId, modelId)) owned.add(modelId);
    }
    const selected = owned.has(incoming.selected) && validModel(weaponId, incoming.selected)
      ? incoming.selected
      : fallback.selected;
    slots[weaponId] = Object.freeze({ selected, owned: Object.freeze([...owned]) });
  }
  return Object.freeze(slots);
}

export function pawnSlugModelArmoryOffers(weaponId, state, { slotUnlocked = false } = {}) {
  const binding = bindingFor(weaponId);
  const slot = createPawnSlugModelArmoryState(state)[weaponId];
  return Object.freeze((PAWN_SLUG_MODEL_ARMORY[weaponId] || []).map((entry) => {
    const model = pawnSlugWeaponModel(binding.family, entry.modelId);
    const owned = slot.owned.includes(entry.modelId);
    return Object.freeze({
      weaponId,
      modelId: entry.modelId,
      label: model?.label || entry.modelId,
      cost: owned ? 0 : entry.cost,
      owned,
      selected: slot.selected === entry.modelId,
      available: weaponId === 'pistol' || slotUnlocked,
    });
  }));
}

export function pawnSlugBuyOrEquipModel(state, weaponId, modelId, {
  credits = 0,
  slotUnlocked = false,
} = {}) {
  const current = createPawnSlugModelArmoryState(state);
  const offers = pawnSlugModelArmoryOffers(weaponId, current, { slotUnlocked });
  const target = offers.find((entry) => entry.modelId === modelId);
  const safeCredits = Math.max(0, Math.floor(Number(credits) || 0));
  if (!target) return Object.freeze({ ok: false, reason: 'unknown-model', credits: safeCredits, state: current });
  if (!target.available) return Object.freeze({ ok: false, reason: 'slot-locked', credits: safeCredits, state: current });
  if (!target.owned && safeCredits < target.cost) {
    return Object.freeze({ ok: false, reason: 'insufficient-credits', cost: target.cost, credits: safeCredits, state: current });
  }

  const slot = current[weaponId];
  const owned = target.owned ? slot.owned : [...slot.owned, modelId];
  return Object.freeze({
    ok: true,
    cost: target.owned ? 0 : target.cost,
    credits: safeCredits - (target.owned ? 0 : target.cost),
    state: createPawnSlugModelArmoryState({
      ...current,
      [weaponId]: { selected: modelId, owned },
    }),
  });
}

export function pawnSlugSelectedModelId(state, weaponId) {
  return createPawnSlugModelArmoryState(state)[weaponId]?.selected || bindingFor(weaponId).modelId;
}

export const PAWN_SLUG_MODEL_ARMORY_META = Object.freeze({
  purchaseCurrency: 'mission-credits',
  selectionWindow: 'briefing-debrief-only',
  defaultModelsOwned: true,
  lockedSlotModelsHiddenFromPurchase: true,
});
