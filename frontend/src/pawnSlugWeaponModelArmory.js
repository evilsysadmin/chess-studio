import { setProfileStorageItem } from './profileKeys.js';
import { getStorageItem, STORAGE_LOCAL } from './safeStorage.js';
import { PAWN_SLUG_WEAPON_MODELS, pawnSlugWeaponModel } from './pawnSlugWeaponModels.js';

const STORAGE_KEY = 'chess-study-pawn-slug-weapon-models-v1';

export const PAWN_SLUG_WEAPON_MODEL_SLOTS = Object.freeze({
  pistol: Object.freeze({ family: 'pistol', defaultModelId: 'dienstpistole' }),
  machinegun: Object.freeze({ family: 'machinegun', defaultModelId: 'mg42' }),
  shotgun: Object.freeze({ family: 'shotgun', defaultModelId: 'm3-super90' }),
  panzerfaust: Object.freeze({ family: 'launcher', defaultModelId: 'panzerfaust' }),
});

const MODEL_COSTS = Object.freeze({
  pistol: Object.freeze({ glock17: 45, dienstpistole: 0, 'desert-eagle': 65 }),
  machinegun: Object.freeze({ m249: 85, mg42: 0, rpk: 70 }),
  shotgun: Object.freeze({ 'm3-super90': 0, m870: 65, spas12: 80 }),
  panzerfaust: Object.freeze({ m79: 90, rpg7: 110, panzerfaust: 0 }),
});

function defaults() {
  return Object.fromEntries(Object.entries(PAWN_SLUG_WEAPON_MODEL_SLOTS).map(([weaponId, slot]) => [weaponId, {
    equipped: slot.defaultModelId,
    owned: [slot.defaultModelId],
  }]));
}

function normalize(raw = {}) {
  const base = defaults();
  const slots = {};
  for (const [weaponId, spec] of Object.entries(PAWN_SLUG_WEAPON_MODEL_SLOTS)) {
    const familyModels = new Set((PAWN_SLUG_WEAPON_MODELS[spec.family] || []).map((model) => model.id));
    const incomingOwned = Array.isArray(raw?.[weaponId]?.owned) ? raw[weaponId].owned : [];
    const owned = [...new Set([spec.defaultModelId, ...incomingOwned.filter((id) => familyModels.has(id))])];
    const requested = raw?.[weaponId]?.equipped;
    const equipped = owned.includes(requested) ? requested : base[weaponId].equipped;
    slots[weaponId] = Object.freeze({ equipped, owned: Object.freeze(owned) });
  }
  return Object.freeze(slots);
}

function readPersisted() {
  const raw = getStorageItem(STORAGE_LOCAL, STORAGE_KEY);
  if (!raw) return normalize();
  try { return normalize(JSON.parse(raw)); } catch { return normalize(); }
}

let currentState = readPersisted();

export function pawnSlugWeaponModelArmoryState() {
  return currentState;
}

export function pawnSlugEquippedModelId(weaponId) {
  const slot = PAWN_SLUG_WEAPON_MODEL_SLOTS[weaponId] || PAWN_SLUG_WEAPON_MODEL_SLOTS.pistol;
  return currentState[weaponId]?.equipped || slot.defaultModelId;
}

export function pawnSlugWeaponModelOffers() {
  return Object.freeze(Object.entries(PAWN_SLUG_WEAPON_MODEL_SLOTS).map(([weaponId, slot]) => Object.freeze({
    weaponId,
    family: slot.family,
    models: Object.freeze((PAWN_SLUG_WEAPON_MODELS[slot.family] || []).map((model) => Object.freeze({
      ...model,
      cost: MODEL_COSTS[weaponId]?.[model.id] ?? 75,
      owned: currentState[weaponId]?.owned.includes(model.id) ?? false,
      equipped: currentState[weaponId]?.equipped === model.id,
    }))),
  }))));
}

export function pawnSlugBuyOrEquipWeaponModel({ weaponId, modelId, credits = 0 } = {}) {
  const slot = PAWN_SLUG_WEAPON_MODEL_SLOTS[weaponId];
  const model = slot ? pawnSlugWeaponModel(slot.family, modelId) : null;
  if (!slot || !model) return Object.freeze({ ok: false, reason: 'unknown-model', credits: Math.max(0, Math.floor(Number(credits) || 0)) });

  const safeCredits = Math.max(0, Math.floor(Number(credits) || 0));
  const current = currentState[weaponId];
  const alreadyOwned = current.owned.includes(model.id);
  const cost = alreadyOwned ? 0 : (MODEL_COSTS[weaponId]?.[model.id] ?? 75);
  if (safeCredits < cost) return Object.freeze({ ok: false, reason: 'insufficient-credits', cost, credits: safeCredits });

  const owned = alreadyOwned ? [...current.owned] : [...current.owned, model.id];
  currentState = normalize({
    ...currentState,
    [weaponId]: { equipped: model.id, owned },
  });
  setProfileStorageItem(STORAGE_KEY, JSON.stringify(currentState));
  return Object.freeze({ ok: true, cost, credits: safeCredits - cost, model, state: currentState });
}

export function resetPawnSlugWeaponModelArmory() {
  currentState = normalize();
  setProfileStorageItem(STORAGE_KEY, JSON.stringify(currentState));
  return currentState;
}

export const PAWN_SLUG_WEAPON_MODEL_ARMORY_META = Object.freeze({
  purchasePhase: 'between-operations-only',
  defaultsOwned: true,
  powerCurve: 'sidegrades-not-upgrades',
  storage: STORAGE_KEY,
  profileProgress: true,
});
