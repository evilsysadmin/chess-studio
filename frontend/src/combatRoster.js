import { setProfileStorageItem, removeProfileStorageItem } from './profileKeys.js';

// combatRoster.js — Progreso de TU ejército del Modo Combate ENTRE
// partidas (localStorage, todavía sin base de datos para esto).
//
// Guarda dos cosas separadas:
//  - `pieces`: el progreso de cada una de tus 16 piezas (fuerza, velocidad,
//    XP sin gastar, y si sigue viva o murió en la última partida).
//  - `combatXp`: una moneda APARTE del XP de cada pieza — se gana al
//    terminar cualquier batalla (más si ganas) y solo sirve para revivir
//    piezas caídas.
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

const ROSTER_KEY = 'chess-study-combat-roster';

// Cuánta XP de combate da cada resultado de partida.
const COMBAT_XP_REWARD = { win: 12, draw: 5, loss: 2 };

function emptyState() {
  return ensureCombatIdentities({ pieces: {}, identities: {}, combatXp: 0, revivesUsed: 0 });
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
      return [key, next];
    }));
    const state = ensureCombatIdentities({ pieces: migratedPieces, identities: parsed.identities || {}, combatXp: parsed.combatXp || 0, revivesUsed: parsed.revivesUsed || 0 });
    saveRoster(state); // persiste migración/aliases recién asignados
    return pruneUnrevivablePieces(state);
  } catch {
    return emptyState();
  }
}

// Limpieza retroactiva: una pieza guardada como "caída" pero sin haber
// invertido nunca un punto (nivel 1 al morir) no tiene nada que revivir —
// la mitad de 0 es 0. `saveSurvivorsToRoster` ya filtra esto al GUARDAR,
// pero un roster guardado ANTES de ese fix puede seguir teniendo restos
// viejos — acá se sanean cada vez que se carga, sin depender de haber
// jugado una partida nueva para que se limpien solos.
function pruneUnrevivablePieces(state) {
  let changed = false;
  const pieces = { ...state.pieces };
  const identities = { ...(state.identities || {}) };
  for (const [key, piece] of Object.entries(pieces)) {
    if (piece.alive === false && (piece.strengthPoints || 0) + (piece.speedPoints || 0) === 0) {
      delete pieces[key];
      delete identities[key];
      changed = true;
    }
  }
  if (!changed) return state;
  const next = ensureCombatIdentities({ ...state, pieces, identities });
  saveRoster(next); // persistimos la limpieza, para no repetirla en cada carga
  return next;
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
      if (strength + speed === 0) {
        // Murió sin haber invertido nunca un punto — revivirla devolvería
        // la mitad de 0, es decir nada. No tiene sentido cobrar XP de
        // combate por eso, así que ni se registra como "caída": desaparece
        // del roster, igual que si nunca hubiera jugado.
        delete pieces[key];
        delete identities[key]; // reemplazo nivel 1 = nueva identidad, no resurrección nominal
        continue;
      }
      // Recién capturada esta partida, con progreso real invertido: guarda
      // su último nivel conocido (para el costo/beneficio de revivirla) y
      // queda marcada muerta.
      pieces[key] = { strengthPoints: strength, speedPoints: speed, bankedXp: prev?.bankedXp || 0, alive: false, deploymentType: prev?.deploymentType || null };
    }
  }

  const combatXp = (rosterState.combatXp || 0) + (COMBAT_XP_REWARD[outcome] || 0);
  return ensureCombatIdentities({ ...rosterState, pieces, combatXp, identities, revivesUsed: rosterState.revivesUsed || 0 });
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
  };

  return {
    pieces: { ...rosterState.pieces, [key]: revived },
    combatXp: rosterState.combatXp - cost,
    revivesUsed: (rosterState.revivesUsed || 0) + 1,
  };
}

// La ventana para revivir a una pieza caída se cierra apenas arranca la
// SIGUIENTE batalla: si no se recuperó a tiempo, se pierde para siempre SU PROGRESO — el slot
// vuelve como una pieza nueva de nivel 1 y el veterano ya no queda guardado.
// Se llama justo antes de armar el tablero inicial de una partida nueva.
export function expireDeadPieces(rosterState) {
  const pieces = { ...rosterState.pieces };
  const identities = { ...(rosterState.identities || {}) };
  let changed = false;
  for (const key of Object.keys(pieces)) {
    if (pieces[key].alive === false) {
      delete pieces[key];
      // La baja definitiva se lleva también su identidad. El reemplazo de
      // nivel 1 que nazca en la siguiente batalla recibirá otro alias/id.
      delete identities[key];
      changed = true;
    }
  }
  return changed ? ensureCombatIdentities({ ...rosterState, pieces, identities }) : rosterState;
}
