import { CANONICAL_ROSTER_SLOTS, rosterSlotKey } from './combat.js';
import { createCombatIdentity } from './combatIdentity.js';
import { canChooseDeploymentType } from './combatMetamorphosis.js';
import { ensureUnitServiceState, unitRecordForKey } from './combatUnitService.js';

// Combat Chess deployment deliberately separates a battlefield SLOT from a
// persistent UNIT identity. A veteran pawn can therefore deploy as a knight
// without ceasing to be a pawn in its dossier/service history.
export const DEPLOYMENT_VERSION = 1;
const FILES = 'abcdefgh'.split('');
const RESERVE_GRANT_LIMIT = 32;

export function originTypeForRosterKey(key) {
  return String(key || '').split('-')[0] || null;
}

export function deploymentSlotSpecs() {
  return CANONICAL_ROSTER_SLOTS.map((slot) => ({
    ...slot,
    key: rosterSlotKey(slot),
    square: `${slot.file}${slot.type === 'p' ? '2' : '1'}`,
  }));
}

export function deploymentSquareForSlot(slotKey, humanColor = 'w') {
  const slot = CANONICAL_ROSTER_SLOTS.find((candidate) => rosterSlotKey(candidate) === slotKey);
  if (!slot) return null;
  const backRank = humanColor === 'b' ? '8' : '1';
  const pawnRank = humanColor === 'b' ? '7' : '2';
  return `${slot.file}${slot.type === 'p' ? pawnRank : backRank}`;
}

export function deploymentSlotForSquare(square, humanColor = 'w') {
  return deploymentSlotSpecs().find((slot) => deploymentSquareForSlot(slot.key, humanColor) === square) || null;
}

export function effectiveDeploymentType(rosterState, unitKey) {
  const origin = originTypeForRosterKey(unitKey);
  const saved = rosterState?.pieces?.[unitKey];
  if (!origin) return null;
  const requested = saved?.deploymentType;
  if (!requested) return origin;
  const record = unitRecordForKey(rosterState, unitKey);
  return canChooseDeploymentType(unitKey, saved, requested, record) ? requested : origin;
}

export function rosterUnitKeys(rosterState, { includeDead = false } = {}) {
  const identities = rosterState?.identities && typeof rosterState.identities === 'object' ? rosterState.identities : {};
  return Object.keys(identities).filter((key) => {
    if (includeDead) return true;
    return rosterState?.pieces?.[key]?.alive !== false;
  });
}

export function isUnitCompatibleWithSlot(rosterState, unitKey, slotKey) {
  const slot = CANONICAL_ROSTER_SLOTS.find((candidate) => rosterSlotKey(candidate) === slotKey);
  if (!slot || !rosterState?.identities?.[unitKey]) return false;
  if (rosterState?.pieces?.[unitKey]?.alive === false) return false;
  if (slot.type === 'k') return unitKey === 'k-e'; // mando fijo: el Rey no entra en la rotación del barracón
  const originType = originTypeForRosterKey(unitKey);
  if (originType === 'k') return false;
  // Regla de identidad: el puesto mira la clase de ORIGEN, no la forma de
  // combate. Un peón metamorfoseado a Caballo sigue siendo un peón del
  // barracón, ocupa un slot de peón y sólo cambia cómo se mueve al combatir.
  return originType === slot.type;
}

function normalizedDeployment(rosterState, source = rosterState?.deployment, { backfillCanonical = false } = {}) {
  const next = {};
  const used = new Set();
  const incoming = source && typeof source === 'object' ? source : {};

  // Preserve explicit assignments first.
  for (const slot of CANONICAL_ROSTER_SLOTS) {
    const slotKey = rosterSlotKey(slot);
    const unitKey = incoming[slotKey];
    if (!unitKey || used.has(unitKey)) continue;
    if (!isUnitCompatibleWithSlot(rosterState, unitKey, slotKey)) continue;
    next[slotKey] = unitKey;
    used.add(unitKey);
  }

  // Migration/default only: a canonical unit occupies its historical slot when
  // compatible and not already deployed elsewhere. Once Deployment v1 exists,
  // explicit holes are intentional (e.g. "Enviar a reserva") and MUST survive
  // subsequent normalization.
  if (backfillCanonical) {
    for (const slot of CANONICAL_ROSTER_SLOTS) {
      const slotKey = rosterSlotKey(slot);
      if (next[slotKey] || used.has(slotKey)) continue;
      if (!isUnitCompatibleWithSlot(rosterState, slotKey, slotKey)) continue;
      next[slotKey] = slotKey;
      used.add(slotKey);
    }
  }

  return next;
}

export function ensureDeploymentState(rosterState) {
  const state = rosterState && typeof rosterState === 'object' ? rosterState : {};
  const current = state.deployment && typeof state.deployment === 'object' ? state.deployment : {};
  const needsInitialBackfill = state.deploymentVersion !== DEPLOYMENT_VERSION;
  const deployment = normalizedDeployment(state, current, { backfillCanonical: needsInitialBackfill });
  const same = JSON.stringify(current) === JSON.stringify(deployment) && state.deploymentVersion === DEPLOYMENT_VERSION;
  return same ? state : { ...state, deploymentVersion: DEPLOYMENT_VERSION, deployment };
}

export function setDeploymentUnit(rosterState, slotKey, unitKey) {
  const state = ensureDeploymentState(rosterState);
  if (!isUnitCompatibleWithSlot(state, unitKey, slotKey)) return state;
  if (slotKey === 'k-e' && unitKey !== 'k-e') return state;
  const deployment = { ...(state.deployment || {}) };
  for (const [candidateSlot, candidateUnit] of Object.entries(deployment)) {
    if (candidateUnit === unitKey) delete deployment[candidateSlot];
  }
  deployment[slotKey] = unitKey; // previous occupant naturally returns to reserve
  return { ...state, deployment: normalizedDeployment(state, deployment) };
}

export function removeDeploymentUnit(rosterState, unitKey) {
  const state = ensureDeploymentState(rosterState);
  if (unitKey === 'k-e') return state;
  const deployment = { ...(state.deployment || {}) };
  let changed = false;
  for (const [slotKey, deployedKey] of Object.entries(deployment)) {
    if (deployedKey !== unitKey) continue;
    delete deployment[slotKey];
    changed = true;
  }
  return changed ? { ...state, deployment: normalizedDeployment(state, deployment) } : state;
}

// Acción rápida de banquillo: devuelve el primer slot compatible realmente
// libre siguiendo el orden canónico del tablero. No desplaza otra unidad.
export function firstFreeDeploymentSlotForUnit(rosterState, unitKey) {
  const state = ensureDeploymentState(rosterState);
  if (!unitKey || Object.values(state.deployment || {}).includes(unitKey)) return null;
  return deploymentSlotSpecs().find((slot) => (
    !state.deployment?.[slot.key] && isUnitCompatibleWithSlot(state, unitKey, slot.key)
  )) || null;
}


function unitDeploymentScore(rosterState, key) {
  const saved = rosterState?.pieces?.[key] || {};
  const record = unitRecordForKey(rosterState, key);
  const statPoints = Math.max(0, Number(saved.strengthPoints) || 0) + Math.max(0, Number(saved.speedPoints) || 0);
  const battles = Math.max(0, Number(record?.stats?.battles) || 0);
  const survivals = Math.max(0, Number(record?.stats?.survivals) || 0);
  return statPoints * 100 + battles * 5 + survivals;
}

export function autofillDeployment(rosterState, { preferVeterans = true } = {}) {
  const state = ensureDeploymentState(rosterState);
  const availableByType = new Map();
  for (const key of rosterUnitKeys(state)) {
    if (key === 'k-e') continue;
    const type = originTypeForRosterKey(key);
    if (!availableByType.has(type)) availableByType.set(type, []);
    availableByType.get(type).push(key);
  }
  for (const keys of availableByType.values()) {
    keys.sort((a, b) => {
      const diff = unitDeploymentScore(state, b) - unitDeploymentScore(state, a);
      if (preferVeterans && diff) return diff;
      if (!preferVeterans && diff) return -diff;
      return fileOrderForUnitKey(a) - fileOrderForUnitKey(b) || String(a).localeCompare(String(b));
    });
  }
  const deployment = {};
  for (const slot of CANONICAL_ROSTER_SLOTS) {
    const slotKey = rosterSlotKey(slot);
    if (slot.type === 'k') {
      if (isUnitCompatibleWithSlot(state, 'k-e', slotKey)) deployment[slotKey] = 'k-e';
      continue;
    }
    const candidates = availableByType.get(slot.type) || [];
    const unitKey = candidates.shift();
    if (unitKey && isUnitCompatibleWithSlot(state, unitKey, slotKey)) deployment[slotKey] = unitKey;
  }
  return { ...state, deploymentVersion: DEPLOYMENT_VERSION, deployment: normalizedDeployment(state, deployment) };
}

export function resetDeployment(rosterState) {
  const state = { ...rosterState, deployment: {} };
  return { ...state, deploymentVersion: DEPLOYMENT_VERSION, deployment: normalizedDeployment(state, {}, { backfillCanonical: true }) };
}

export function deploymentSummary(rosterState) {
  const state = ensureDeploymentState(rosterState);
  const specs = deploymentSlotSpecs();
  const missing = specs.filter((slot) => !state.deployment?.[slot.key]);
  const deployedKeys = Object.values(state.deployment || {});
  const deployed = new Set(deployedKeys);
  const activeKeys = rosterUnitKeys(state);
  const fallenKeys = rosterUnitKeys(state, { includeDead: true }).filter((key) => state?.pieces?.[key]?.alive === false);
  const reserves = activeKeys.filter((key) => originTypeForRosterKey(key) !== 'k' && !deployed.has(key));
  return {
    ready: missing.length === 0,
    assignedCount: specs.length - missing.length,
    totalSlots: specs.length,
    missingSlots: missing,
    deployedKeys,
    reserveKeys: reserves,
    reserveCount: reserves.length,
    fallenKeys,
    fallenCount: fallenKeys.length,
    totalRoster: activeKeys.length,
    totalIdentities: activeKeys.length + fallenKeys.length,
  };
}

export function isDeploymentReadyForBattle(rosterState) {
  const summary = deploymentSummary(rosterState);
  // Tener 16 casillas cubiertas no basta si aún hay identidades caídas cuya
  // recuperación/reemplazo no se ha resuelto. Esta función es la fuente única
  // de verdad para poder CONFIRMAR DESPLIEGUE.
  return summary.ready && summary.fallenCount === 0;
}

function removeHumanDeploymentSquares(chess, humanColor) {
  for (const slot of CANONICAL_ROSTER_SLOTS) {
    const square = deploymentSquareForSlot(rosterSlotKey(slot), humanColor);
    const piece = square ? chess.get(square) : null;
    if (piece?.color === humanColor) chess.remove(square);
  }
}

export function applyDeploymentToPosition(chess, rosterState, humanColor) {
  const state = ensureDeploymentState(rosterState);
  removeHumanDeploymentSquares(chess, humanColor);
  for (const slot of CANONICAL_ROSTER_SLOTS) {
    const slotKey = rosterSlotKey(slot);
    const unitKey = state.deployment?.[slotKey];
    if (!unitKey) continue;
    const square = deploymentSquareForSlot(slotKey, humanColor);
    const type = effectiveDeploymentType(state, unitKey);
    if (!square || !type || !isUnitCompatibleWithSlot(state, unitKey, slotKey)) continue;
    chess.put({ type, color: humanColor }, square);
  }
  return state;
}

export function annotateRegistryWithDeployment(registry, rosterState, humanColor) {
  const state = ensureDeploymentState(rosterState);
  const next = { ...registry };
  for (const [slotKey, unitKey] of Object.entries(state.deployment || {})) {
    const square = deploymentSquareForSlot(slotKey, humanColor);
    const piece = square ? next[square] : null;
    if (!piece || piece.color !== humanColor) continue;
    const originType = originTypeForRosterKey(unitKey);
    next[square] = {
      ...piece,
      id: `${humanColor}-${originType || piece.type}-${square}`,
      rosterKey: unitKey,
      originType: originType || piece.type,
      deploymentSlot: slotKey,
      deploymentType: piece.type === originType ? null : piece.type,
    };
  }
  return next;
}

export function deploymentFen(rosterState) {
  const state = ensureDeploymentState(rosterState);
  const board = Array.from({ length: 8 }, () => Array(8).fill(''));
  for (const [slotKey, unitKey] of Object.entries(state.deployment || {})) {
    const square = deploymentSquareForSlot(slotKey, 'w');
    const type = effectiveDeploymentType(state, unitKey);
    if (!square || !type) continue;
    const file = FILES.indexOf(square[0]);
    const rank = Number(square[1]);
    if (file < 0 || rank < 1 || rank > 8) continue;
    board[8 - rank][file] = type.toUpperCase();
  }
  const placement = board.map((row) => {
    let encoded = '';
    let empty = 0;
    for (const cell of row) {
      if (!cell) { empty += 1; continue; }
      if (empty) { encoded += String(empty); empty = 0; }
      encoded += cell;
    }
    if (empty) encoded += String(empty);
    return encoded || '8';
  }).join('/');
  // Board.jsx sólo necesita la colocación. Dejamos el resto de campos FEN
  // convencionales para que cualquier consumidor secundario siga recibiendo
  // una cadena con forma estándar, sin inventar composición enemiga.
  return `${placement} w - - 0 1`;
}

function recruitKey(originType, identityId) {
  const token = String(identityId || '').replace(/[^a-z0-9]/gi, '').slice(-10) || Date.now().toString(36);
  return `${originType}-reserve-${token}`;
}

export function grantReserveRecruit(rosterState, { grantId, originType = 'p', rng = Math.random, now = Date.now() } = {}) {
  const allowedType = ['p', 'n', 'b', 'r', 'q'].includes(originType) ? originType : 'p';
  let state = ensureDeploymentState(rosterState);
  const processed = Array.isArray(state.reserveRecruitGrantIds) ? state.reserveRecruitGrantIds : [];
  if (grantId && processed.includes(grantId)) return state;

  const aliases = Object.values(state.identities || {}).map((entry) => entry?.alias).filter(Boolean);
  const identity = createCombatIdentity(aliases, rng, now);
  let key = recruitKey(allowedType, identity.identityId);
  let suffix = 1;
  while (state.identities?.[key]) key = `${recruitKey(allowedType, identity.identityId)}-${suffix++}`;

  const pieces = {
    ...(state.pieces || {}),
    [key]: {
      strengthPoints: 0,
      speedPoints: 0,
      bankedXp: 0,
      alive: true,
      deploymentType: null,
      unlockedTechniques: [],
      equippedTechnique: null,
    },
  };
  const identities = { ...(state.identities || {}), [key]: identity };
  const reserveRecruitGrantIds = grantId
    ? [...processed.filter((id) => id !== grantId), grantId].slice(-RESERVE_GRANT_LIMIT)
    : processed;
  state = ensureUnitServiceState({ ...state, pieces, identities, reserveRecruitGrantIds });
  return ensureDeploymentState(state);
}

export function reserveRecruitTypeForNode(node) {
  if (!node) return 'p';
  if (node.type === 'camp') return 'p';
  if (node.type === 'elite') {
    if ((node.stage || 0) >= 6) return 'r';
    if ((node.stage || 0) >= 4) return 'b';
    return 'n';
  }
  return 'p';
}

export function slotLabel(slotKey) {
  const type = String(slotKey || '').split('-')[0];
  const file = String(slotKey || '').split('-')[1] || '';
  const names = { p: 'Peón', n: 'Caballo', b: 'Alfil', r: 'Torre', q: 'Dama', k: 'Rey' };
  return `${names[type] || type} ${file.toUpperCase()}`.trim();
}

export function fileOrderForUnitKey(key) {
  const parts = String(key || '').split('-');
  const file = parts.length === 2 ? parts[1] : '';
  const index = FILES.indexOf(file);
  return index < 0 ? 99 : index;
}
