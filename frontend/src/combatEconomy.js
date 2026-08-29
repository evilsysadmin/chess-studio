import { Chess } from 'chess.js';
import { createCombatIdentity } from './combatIdentity.js';
import { ensureUnitServiceState } from './combatUnitService.js';
import { ensureDeploymentState } from './combatDeployment.js';
import { hasAdminPreviewAccess } from './adminPreview.js';

export const COMBAT_STARTING_CREDITS = 36;
export const COMBAT_ECONOMY_VERSION = 2;

export const COMBAT_EQUIPMENT = Object.freeze([
  { id: 'service-pistol', label: 'Pistola de servicio', kind: 'Arma', icon: '⌁', minLevel: 2, cost: 18, strength: 1, speed: 0, description: '+1 fuerza. Fiable y barata.' },
  { id: 'mobility-rig', label: 'Equipo de movilidad', kind: 'Utilidad', icon: '↗', minLevel: 4, cost: 30, strength: 0, speed: 2, description: '+2 velocidad. Para unidades que necesitan sobrevivir al contacto.' },
  { id: 'assault-rifle', label: 'Rifle de asalto', kind: 'Arma', icon: '⌁', minLevel: 5, cost: 40, strength: 2, speed: 0, description: '+2 fuerza. Potencia contenida para veteranos.' },
  { id: 'field-armor', label: 'Blindaje ligero', kind: 'Defensa', icon: '◇', minLevel: 6, cost: 48, strength: 1, speed: 1, description: '+1 fuerza y +1 velocidad. Versátil, no dominante.' },
  { id: 'sniper-rifle', label: 'Rifle de precisión', kind: 'Arma', icon: '⌖', minLevel: 8, cost: 58, strength: 2, speed: 0, description: '+2 fuerza. Requiere una unidad curtida.' },
]);

const UNIT_VALUE = Object.freeze({ p: 16, n: 24, b: 24, r: 32, q: 48 });
const CONTRACT_MULTIPLIER = Object.freeze({ one: 1, three: 2.35, permanent: 7 });
const CONTRACT_BATTLES = Object.freeze({ one: 1, three: 3, permanent: null });
const MERCENARY_NAMES = Object.freeze(['Ámbar', 'Boreal', 'Cobra', 'Delta', 'Eco', 'Faro', 'Galia', 'Halcón', 'Ícaro', 'Jade', 'Kilo', 'Lince']);

const MERCENARY_SPECIALTIES = Object.freeze([
  { id: 'scout', label: 'Explorador', description: 'Movilidad y supervivencia para abrir rutas.', preferredEquipment: ['mobility-rig', 'service-pistol'] },
  { id: 'assault', label: 'Asalto', description: 'Pegada inmediata para sectores duros.', preferredEquipment: ['assault-rifle', 'service-pistol'] },
  { id: 'guard', label: 'Guardia', description: 'Perfil equilibrado para proteger veteranos.', preferredEquipment: ['field-armor', 'mobility-rig', 'service-pistol'] },
]);

const MERCENARY_FIELD_BONUS = Object.freeze({
  scout: Object.freeze({ strength: 0, speed: 4, label: '+4 velocidad operativa' }),
  assault: Object.freeze({ strength: 2, speed: 0, label: '+2 fuerza operativa' }),
  guard: Object.freeze({ strength: 1, speed: 2, label: '+1 fuerza · +2 velocidad operativa' }),
});

export function mercenaryFieldBonus(specialtyId) {
  return MERCENARY_FIELD_BONUS[specialtyId] || Object.freeze({ strength: 0, speed: 0, label: 'sin bono operativo' });
}

function mercenaryEquipmentFor(level, specialty) {
  for (const itemId of specialty.preferredEquipment) {
    const item = COMBAT_EQUIPMENT.find((candidate) => candidate.id === itemId);
    if (item && level >= item.minLevel) return item;
  }
  return null;
}

function int(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : fallback;
}

function hash(value) {
  let result = 2166136261;
  for (const char of String(value)) {
    result ^= char.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function seeded(seed, salt) {
  return hash(`${seed}:${salt}`) / 0xffffffff;
}

export function normalizeCombatEconomy(raw = {}) {
  const rawCredits = raw.credits;
  const hasCredits = rawCredits != null
    && !(typeof rawCredits === 'string' && rawCredits.trim() === '')
    && Number.isFinite(Number(rawCredits));
  const legacyXp = int(raw.combatXp);
  return {
    credits: hasCredits ? int(rawCredits) : COMBAT_STARTING_CREDITS + legacyXp * 2,
    combatXp: 0,
    economyVersion: COMBAT_ECONOMY_VERSION,
    processedCreditBattleIds: Array.isArray(raw.processedCreditBattleIds) ? raw.processedCreditBattleIds.slice(-120) : [],
    marketPurchases: Array.isArray(raw.marketPurchases) ? raw.marketPurchases.slice(-80) : [],
  };
}

export function battleCreditReward({
  outcome, captures = 0, floor = 0, encounterTier = 'normal', variant = 'combat',
  casualties = 0, deployed = 15, underdogCredits = 0, tacticalCredits = 0,
} = {}) {
  if (outcome === 'retired') return { total: 0, captures: 0, result: 0, sector: 0, preservation: 0, underdog: 0, tactics: 0, capped: 0 };

  // Capturar importa, pero con rendimiento decreciente: las primeras cuatro
  // bajas pagan 2, las siguientes 1 y a partir de ocho dejan de imprimir
  // dinero. Así una partida larga no se convierte en una granja de créditos.
  const safeCaptures = int(captures);
  const captureCredits = Math.min(8, safeCaptures) + Math.min(4, safeCaptures);
  const resultCredits = outcome === 'win' ? 5 : outcome === 'draw' ? 1 : 0;
  const campaignBattle = variant === 'roguelike';
  const tierBonus = encounterTier === 'boss' ? 6 : encounterTier === 'elite' ? 3 : 0;
  const sectorCredits = outcome === 'win' && campaignBattle ? Math.min(12, 2 + Math.floor(int(floor) / 2) + tierBonus) : 0;

  const safeCasualties = Math.min(int(deployed), int(casualties));
  const preservationCredits = outcome !== 'win' ? 0 : safeCasualties === 0 ? 5 : safeCasualties <= 2 ? 3 : safeCasualties <= 4 ? 1 : 0;
  const underdog = Math.min(6, int(underdogCredits));
  const tactics = Math.min(4, int(tacticalCredits));
  const rawTotal = captureCredits + resultCredits + sectorCredits + preservationCredits + underdog + tactics;

  // Perder puede reconocer una buena acción, pero nunca ser el método óptimo
  // de financiar el mercado. Draw también tiene un techo bajo. Ganar élites y
  // bosses abre algo más el grifo porque el riesgo real es mayor.
  const cap = outcome === 'loss' ? 8 : outcome === 'draw' ? 12 : encounterTier === 'boss' ? 40 : encounterTier === 'elite' ? 34 : 28;
  const total = Math.min(cap, rawTotal);
  return { total, captures: captureCredits, result: resultCredits, sector: sectorCredits, preservation: preservationCredits, underdog, tactics, capped: Math.max(0, rawTotal - total) };
}

const CREDIT_MATERIAL_VALUE = Object.freeze({ p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 });

// Señales de mérito que miran la intención ajedrecística ANTES de que el dado
// de Combat decida el impacto. Una captura legal de peón sobre dama, o un
// ataque legal que daría jaque pero falla por esquive, conserva parte del
// mérito económico aunque la animación termine en "fallo".
export function combatCreditSignalForAttempt({ fen, from, to, promotion, attacker, defender, hit } = {}) {
  let underdogCredits = 0;
  let tacticalCredits = 0;
  const attackerValue = CREDIT_MATERIAL_VALUE[attacker?.type] || 0;
  const defenderValue = CREDIT_MATERIAL_VALUE[defender?.type] || 0;
  const gap = defender ? defenderValue - attackerValue : 0;
  if (defender && gap >= 2) {
    const weight = gap >= 5 ? 3 : 2;
    if (hit === true) underdogCredits += weight;
    else if (hit === false) tacticalCredits += Math.max(1, weight - 1);
  }
  try {
    const chess = new Chess(fen);
    const applied = chess.move({ from, to, promotion: promotion || 'q' });
    if (applied && chess.isCheck()) tacticalCredits += chess.isCheckmate() ? 2 : 1;
  } catch {
    // La señal económica nunca puede romper una jugada válida del motor.
  }
  return { underdogCredits, tacticalCredits };
}

export function awardCombatCredits(rosterState, reward, battleId = null) {
  const amount = int(reward?.total ?? reward);
  const processed = Array.isArray(rosterState?.processedCreditBattleIds) ? rosterState.processedCreditBattleIds : [];
  if (!amount || (battleId && processed.includes(battleId))) return rosterState;
  return {
    ...rosterState,
    credits: int(rosterState?.credits) + amount,
    processedCreditBattleIds: battleId ? [...processed, battleId].slice(-120) : processed,
  };
}

export function equipmentById(id) {
  return COMBAT_EQUIPMENT.find((item) => item.id === id) || null;
}

export function equipmentBonus(itemId) {
  const item = equipmentById(itemId);
  return item ? { strength: item.strength, speed: item.speed } : { strength: 0, speed: 0 };
}

export function equipmentMarketOffers({ rotationKey = marketRotationKey(), count = 3 } = {}) {
  const catalog = [...COMBAT_EQUIPMENT];
  const offset = Math.floor(seeded(rotationKey, 'equipment-offset') * catalog.length) % catalog.length;
  const wanted = Math.max(1, Math.min(catalog.length, Math.floor(Number(count) || 3)));
  return Array.from({ length: wanted }, (_, index) => catalog[(offset + index * 2) % catalog.length]);
}

export function unitLevel(piece) {
  return 1 + int(piece?.strengthPoints) + int(piece?.speedPoints);
}

export function buyEquipment(rosterState, itemId, unitKey) {
  const item = equipmentById(itemId);
  const piece = rosterState?.pieces?.[unitKey];
  const adminPreview = hasAdminPreviewAccess();
  if (!item || !piece || piece.alive === false || piece.equipmentId || (!adminPreview && (unitLevel(piece) < item.minLevel || int(rosterState?.credits) < item.cost))) return rosterState;
  return {
    ...rosterState,
    credits: adminPreview ? int(rosterState.credits) : int(rosterState.credits) - item.cost,
    pieces: { ...rosterState.pieces, [unitKey]: { ...piece, equipmentId: item.id } },
  };
}

export function unequipEquipment(rosterState, unitKey) {
  const piece = rosterState?.pieces?.[unitKey];
  if (!piece?.equipmentId) return rosterState;
  return { ...rosterState, pieces: { ...rosterState.pieces, [unitKey]: { ...piece, equipmentId: null } } };
}

export function marketRotationKey(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  return Number.isNaN(date.getTime()) ? '1970-01-01' : date.toISOString().slice(0, 10);
}

export function mercenaryMarketOffers({ merit = 0, rotationKey = marketRotationKey() } = {}) {
  const baseLevel = Math.max(1, Math.min(7, 1 + Math.floor(int(merit) / 45)));
  const types = ['p', 'n', 'b', 'r'];
  const typeOffset = Math.floor(seeded(rotationKey, 'type-offset') * types.length) % types.length;
  const nameOffset = Math.floor(seeded(rotationKey, 'name-offset') * MERCENARY_NAMES.length) % MERCENARY_NAMES.length;
  return Array.from({ length: 3 }, (_, index) => {
    const roll = seeded(rotationKey, `merc:${index}:${baseLevel}`);
    const rare = index === 2 && roll > 0.82;
    const type = rare && baseLevel >= 5 ? 'q' : types[(typeOffset + index) % types.length];
    const level = Math.min(9, baseLevel + (rare ? 1 : 0));
    const points = Math.max(0, level - 1);
    const specialty = MERCENARY_SPECIALTIES[(typeOffset + index) % MERCENARY_SPECIALTIES.length];
    const strengthPoints = specialty.id === 'assault'
      ? Math.ceil(points * 0.75)
      : specialty.id === 'scout'
        ? Math.floor(points * 0.25)
        : Math.ceil(points / 2);
    const speedPoints = Math.max(0, points - strengthPoints);
    const fieldBonus = mercenaryFieldBonus(specialty.id);
    // La especialidad tiene valor real en el campo, así que también paga una
    // pequeña prima. Evita que un mercenario operativo sea simplemente un
    // recluta mejorado al mismo precio y mantiene el contrato como decisión.
    const specialtyPremium = Math.ceil((fieldBonus.strength * 2) + fieldBonus.speed);
    const baseCost = Math.round((UNIT_VALUE[type] + points * 5 + specialtyPremium) * (rare ? 1.45 : 1));
    const id = `${rotationKey}-${index}-${type}-${level}`;
    const includedEquipment = mercenaryEquipmentFor(level, specialty);
    return {
      id,
      type,
      level,
      strengthPoints,
      speedPoints,
      rarity: rare ? 'veterano' : 'regular',
      alias: `${MERCENARY_NAMES[(nameOffset + index * 5) % MERCENARY_NAMES.length]}-${index + 1}`,
      specialtyId: specialty.id,
      specialtyLabel: specialty.label,
      specialtyDescription: specialty.description,
      fieldBonus,
      equipmentId: includedEquipment?.id || null,
      equipmentLabel: includedEquipment?.label || null,
      prices: Object.fromEntries(Object.entries(CONTRACT_MULTIPLIER).map(([contract, multiplier]) => [contract, Math.ceil(baseCost * multiplier)])),
    };
  });
}

function mercenaryKey(type, identityId) {
  return `${type}-merc-${String(identityId).replace(/[^a-z0-9]/gi, '').slice(-10)}`;
}

export function hireMercenary(rosterState, offer, contract = 'one', now = Date.now()) {
  const price = int(offer?.prices?.[contract]);
  const adminPreview = hasAdminPreviewAccess();
  if (!offer || !price || !(contract in CONTRACT_BATTLES) || (!adminPreview && int(rosterState?.credits) < price)) return rosterState;
  const purchaseId = offer.id;
  const purchases = Array.isArray(rosterState.marketPurchases) ? rosterState.marketPurchases : [];
  if (purchases.includes(purchaseId)) return rosterState;
  const aliases = Object.values(rosterState.identities || {}).map((entry) => entry?.alias).filter(Boolean);
  const identity = { ...createCombatIdentity(aliases, () => seeded(offer.id, now), now), alias: offer.alias };
  let key = mercenaryKey(offer.type, identity.identityId);
  let suffix = 1;
  while (rosterState.identities?.[key]) key = `${mercenaryKey(offer.type, identity.identityId)}-${suffix++}`;
  const state = ensureUnitServiceState({
    ...rosterState,
    credits: adminPreview ? int(rosterState.credits) : int(rosterState.credits) - price,
    marketPurchases: [...purchases, purchaseId].slice(-80),
    identities: { ...(rosterState.identities || {}), [key]: identity },
    pieces: {
      ...(rosterState.pieces || {}),
      [key]: {
        strengthPoints: int(offer.strengthPoints), speedPoints: int(offer.speedPoints), bankedXp: 0, alive: true,
        deploymentType: null, unlockedTechniques: [], equippedTechnique: null, equipmentId: offer.equipmentId || null,
        mercenary: {
          offerId: offer.id,
          contract,
          battlesRemaining: CONTRACT_BATTLES[contract],
          rarity: offer.rarity || 'regular',
          specialtyId: offer.specialtyId || null,
          specialtyLabel: offer.specialtyLabel || null,
          fieldStrengthBonus: Number(offer.fieldBonus?.strength) || 0,
          fieldSpeedBonus: Number(offer.fieldBonus?.speed) || 0,
          fieldBonusLabel: offer.fieldBonus?.label || null,
          hiredAt: new Date(now).toISOString(),
        },
      },
    },
  });
  return ensureDeploymentState(state);
}

export function settleMercenaryContracts(rosterState, deployedKeys = []) {
  const participants = new Set(deployedKeys || []);
  const pieces = { ...(rosterState?.pieces || {}) };
  const identities = { ...(rosterState?.identities || {}) };
  const unitRecords = { ...(rosterState?.unitRecords || {}) };
  const completed = [];
  let changed = false;
  for (const key of participants) {
    const piece = pieces[key];
    const contract = piece?.mercenary;
    if (!contract || contract.battlesRemaining == null) continue;
    const remaining = Math.max(0, int(contract.battlesRemaining) - 1);
    if (remaining > 0) {
      pieces[key] = { ...piece, mercenary: { ...contract, battlesRemaining: remaining } };
      changed = true;
      continue;
    }
    completed.push(identities[key]?.alias || key);
    if (identities[key]?.identityId) delete unitRecords[identities[key].identityId];
    delete pieces[key];
    delete identities[key];
    changed = true;
  }
  if (!changed) return { roster: rosterState, completed };
  return { roster: ensureDeploymentState({ ...rosterState, pieces, identities, unitRecords }), completed };
}
