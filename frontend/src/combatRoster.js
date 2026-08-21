import { setProfileStorageItem, removeProfileStorageItem } from './profileKeys.js';

// combatRoster.js — Progreso de TU ejército del Modo Combate ENTRE
// partidas (localStorage, todavía sin base de datos para esto).
//
// Guarda en una sola estructura el estado activo y su historia:
//  - `pieces`: progreso/loadout de cada slot militar;
//  - `identities` + `unitRecords`: nombre e historial de la identidad actual;
//  - `memorial`: identidades que murieron de forma definitiva;
//  - `combatXp`: moneda separada que sólo sirve para revivir bajas recuperables.
//
// OJO con el color: si eliges "aleatorio" puedes jugar blancas una partida y
// negras la siguiente. Por eso la clave de cada pieza NO incluye el color
// (ver `rosterKeyFor` en combat.js) — "tu caballo de dama" es el mismo
// concepto sea cual sea el color que te haya tocado. Y por la misma razón,
// acá solo se guardan/aplican las piezas del color que jugó el HUMANO esa
// partida — nunca las del rival, o terminarías subiéndole de nivel al
// ejército que te toca enfrentar la próxima vez.

import { rosterKeyFor, CANONICAL_ROSTER_SLOTS, rosterSlotKey, reviveCost } from './combat.js';
import { ensureCombatIdentities, combatIdentityFor } from './combatIdentity.js';
import { normalizeTechniqueState } from './combatTechniques.js';
import { ensureUnitServiceState, recordUnitRevive, archivePermanentCasualty } from './combatUnitService.js';

const ROSTER_KEY = 'chess-study-combat-roster';

// Cuánta XP de combate da cada resultado de partida.
const COMBAT_XP_REWARD = { win: 12, draw: 5, loss: 2 };

function emptyState() {
  return ensureUnitServiceState(ensureCombatIdentities({
    pieces: {}, identities: {}, unitRecords: {}, memorial: [], unitServiceProcessedBattleIds: [], combatXp: 0, revivesUsed: 0,
  }));
}


export function loadRoster() {
  try {
    const raw = localStorage.getItem(ROSTER_KEY);
    if (!raw) {
      const fresh = emptyState();
      saveRoster(fresh);
      return fresh;
    }
    const parsed = JSON.parse(raw);
    const migratedPieces = Object.fromEntries(Object.entries(parsed.pieces || {}).map(([key, piece]) => {
      const next = { ...piece };
      // Migración desde v16.6as: la metamorfosis permanente pasa a ser una
      // preferencia de despliegue. Si ya no está desbloqueada, el aplicador
      // la ignorará y la pieza saldrá en su clase original.
      if (next.metamorphosis && !next.deploymentType) next.deploymentType = next.metamorphosis;
      delete next.metamorphosis;
      return [key, normalizeTechniqueState(next)];
    }));
    const state = ensureUnitServiceState(ensureCombatIdentities({
      ...parsed,
      pieces: migratedPieces,
      identities: parsed.identities || {},
      unitRecords: parsed.unitRecords || {},
      memorial: Array.isArray(parsed.memorial) ? parsed.memorial : [],
      unitServiceProcessedBattleIds: Array.isArray(parsed.unitServiceProcessedBattleIds) ? parsed.unitServiceProcessedBattleIds : [],
      combatXp: parsed.combatXp || 0,
      revivesUsed: parsed.revivesUsed || 0,
    }));
    saveRoster(state); // persiste migraciones, aliases y expedientes recién creados
    return state;
  } catch {
    return emptyState();
  }
}

export function saveRoster(state) {
  setProfileStorageItem(ROSTER_KEY, JSON.stringify(state));
}

export function resetRoster({ persist = true } = {}) {
  removeProfileStorageItem(ROSTER_KEY);
  const fresh = emptyState();
  // El reset específico del ejército crea/persiste inmediatamente el nuevo
  // destacamento (con identidades nuevas). El reset global de progreso, en
  // cambio, necesita dejar localStorage realmente vacío para que el perfil
  // borrado no reaparezca con un roster recién generado.
  if (persist) saveRoster(fresh);
  return fresh;
}


// Aplica el progreso guardado a un registro recién creado al arrancar una
// partida nueva. Solo toca las piezas del color que juega el humano esta
// vez; las del rival siempre arrancan de cero. Una pieza sin registro (o
// marcada muerta y no revivida) arranca fresca, en nivel 1.
export function applyRosterToRegistry(registry, rosterState, humanColor) {
  const next = {};
  for (const [square, piece] of Object.entries(registry)) {
    if (piece.color !== humanColor) {
      next[square] = piece;
      continue;
    }
    const key = rosterKeyFor(piece);
    const saved = rosterState.pieces[key];
    const identity = combatIdentityFor(rosterState, key) || {};
    if (!saved || saved.alive === false) {
      next[square] = { ...piece, ...identity }; // fresca de nivel 1, pero ya tiene nombre
      continue;
    }
    next[square] = {
      ...piece,
      strengthPoints: saved.strengthPoints || 0,
      speedPoints: saved.speedPoints || 0,
      bankedXp: saved.bankedXp || 0,
      deploymentType: saved.deploymentType || null,
      unlockedTechniques: Array.isArray(saved.unlockedTechniques) ? [...saved.unlockedTechniques] : [],
      equippedTechnique: saved.equippedTechnique || null,
      techniqueUsed: false,
      ...identity,
    };
  }
  return next;
}

// Guarda el resultado de la partida en el roster: las piezas del humano que
// llegaron vivas quedan marcadas `alive: true` con su progreso actual. Las
// que estaban en juego pero YA NO aparecen en el registro final fueron
// capturadas esta partida — se marcan `alive: false`, guardando su último
// nivel conocido (para poder calcular el costo/beneficio de revivirlas más
// adelante), pero SIN que ese progreso siga contando como activo. Esto es
// lo que antes no pasaba: una pieza capturada se quedaba con el nivel de
// antes de la partida en vez de "morir" de verdad.
export function saveSurvivorsToRoster(registry, rosterState, humanColor, outcome) {
  const pieces = { ...rosterState.pieces };
  const identities = { ...(rosterState.identities || {}) };
  const survivingKeys = new Set();

  for (const piece of Object.values(registry)) {
    if (piece.color !== humanColor || piece.type === 'k') continue; // el rey no participa del roster
    const key = rosterKeyFor(piece);
    survivingKeys.add(key);
    pieces[key] = {
      strengthPoints: piece.strengthPoints || 0,
      speedPoints: piece.speedPoints || 0,
      bankedXp: piece.bankedXp || 0,
      alive: true,
      deploymentType: piece.deploymentType || null,
      unlockedTechniques: Array.isArray(piece.unlockedTechniques) ? [...piece.unlockedTechniques] : [],
      equippedTechnique: piece.equippedTechnique || null,
    };
  }

  for (const slot of CANONICAL_ROSTER_SLOTS) {
    if (slot.type === 'k') continue; // el rey nunca "muere" en este sentido
    const key = rosterSlotKey(slot);
    if (survivingKeys.has(key)) continue;
    const prev = pieces[key];
    if (!prev || prev.alive !== false) {
      const strength = prev?.strengthPoints || 0;
      const speed = prev?.speedPoints || 0;
      // Toda identidad que cae queda registrada hasta la siguiente batalla,
      // incluso si era un recluta nivel 1. Los reclutas sin inversión no son
      // revivibles, pero así su nombre puede pasar al Memorial antes de que el
      // slot reciba un reemplazo distinto.
      pieces[key] = {
        strengthPoints: strength,
        speedPoints: speed,
        bankedXp: prev?.bankedXp || 0,
        alive: false,
        deploymentType: prev?.deploymentType || null,
        unlockedTechniques: Array.isArray(prev?.unlockedTechniques) ? [...prev.unlockedTechniques] : [],
        equippedTechnique: prev?.equippedTechnique || null,
      };
    }
  }

  const combatXp = (rosterState.combatXp || 0) + (COMBAT_XP_REWARD[outcome] || 0);
  return ensureUnitServiceState(ensureCombatIdentities({ ...rosterState, pieces, combatXp, identities, revivesUsed: rosterState.revivesUsed || 0 }));
}

// Revive una pieza caída gastando XP de combate: le devuelve la MITAD de
// los puntos de fuerza/velocidad que tenía al morir (redondeando hacia
// abajo) — no vuelve intacta, pero tampoco arranca totalmente de cero.
export function revivePiece(rosterState, key, type) {
  const dead = rosterState.pieces[key];
  if (!dead || dead.alive !== false) return rosterState;
  if ((dead.strengthPoints || 0) + (dead.speedPoints || 0) === 0) return rosterState; // nada que revivir, la mitad de 0 es 0
  const cost = reviveCost(type);
  if ((rosterState.combatXp || 0) < cost) return rosterState;

  const revived = {
    strengthPoints: Math.floor((dead.strengthPoints || 0) / 2),
    speedPoints: Math.floor((dead.speedPoints || 0) / 2),
    bankedXp: 0,
    alive: true,
    deploymentType: dead.deploymentType || null,
    unlockedTechniques: Array.isArray(dead.unlockedTechniques) ? [...dead.unlockedTechniques] : [],
    equippedTechnique: dead.equippedTechnique || null,
  };

  return recordUnitRevive({
    ...rosterState,
    pieces: { ...rosterState.pieces, [key]: revived },
    combatXp: rosterState.combatXp - cost,
    revivesUsed: (rosterState.revivesUsed || 0) + 1,
  }, key);
}

// La ventana para revivir a una pieza caída se cierra apenas arranca la
// SIGUIENTE batalla: si no se recuperó a tiempo, se pierde para siempre SU PROGRESO — el slot
// vuelve como una pieza nueva de nivel 1 y el veterano ya no queda guardado.
// Se llama justo antes de armar el tablero inicial de una partida nueva.
export function expireDeadPieces(rosterState, at = new Date().toISOString()) {
  let state = ensureUnitServiceState(rosterState);
  let pieces = { ...state.pieces };
  let identities = { ...(state.identities || {}) };
  let changed = false;
  for (const key of Object.keys(pieces)) {
    if (pieces[key].alive === false) {
      // Primero archivamos la identidad y su expediente; sólo después se
      // elimina el slot activo. El reemplazo generado por ensureCombatIdentities
      // nace con otro alias/id y empieza de cero.
      state = archivePermanentCasualty({ ...state, pieces, identities }, key, at);
      pieces = { ...state.pieces };
      identities = { ...(state.identities || {}) };
      delete pieces[key];
      delete identities[key];
      changed = true;
    }
  }
  return changed
    ? ensureUnitServiceState(ensureCombatIdentities({ ...state, pieces, identities }))
    : state;
}
