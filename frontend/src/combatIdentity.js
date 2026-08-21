// Identidad persistente de las piezas de Combate. El alias nace con la pieza,
// no con la veteranía. Si una baja expira y el slot recibe un reemplazo de
// nivel 1, esa identidad se elimina y se genera otra.
import { CANONICAL_ROSTER_SLOTS, rosterSlotKey } from './combat.js';

const ALIASES = Object.freeze([
  'Starky', 'Hutch', 'Blockade', 'Skippy', 'Missus', 'Noodles', 'Sapper', 'Biscuit',
  'Latch', 'Bruno', 'Moxie', 'Rookster', 'Patch', 'Dusty', 'Knuckles', 'Marlow',
  'Cinder', 'Twitch', 'Mugs', 'Flick', 'Rivet', 'Pogo', 'Dagger', 'Minnie',
  'Cricket', 'Gasket', 'Pepper', 'Bunker', 'Lucky', 'Socks', 'Spanner', 'Murmur',
]);

function randomToken(rng = Math.random) {
  return Math.floor(rng() * 0x7fffffff).toString(36).padStart(6, '0');
}

export function createCombatIdentity(existingAliases = [], rng = Math.random, now = Date.now()) {
  const used = new Set(existingAliases.filter(Boolean));
  const available = ALIASES.filter((alias) => !used.has(alias));
  const pool = available.length ? available : ALIASES;
  const alias = pool[Math.floor(rng() * pool.length) % pool.length];
  return { alias, identityId: `unit-${now.toString(36)}-${randomToken(rng)}`, createdAt: new Date(now).toISOString() };
}

export function ensureCombatIdentities(rosterState, rng = Math.random, now = Date.now()) {
  const identities = { ...(rosterState?.identities || {}) };
  let changed = false;
  const aliases = Object.values(identities).map((entry) => entry?.alias).filter(Boolean);
  for (const slot of CANONICAL_ROSTER_SLOTS) {
    const key = rosterSlotKey(slot);
    if (identities[key]?.alias && identities[key]?.identityId) continue;
    const identity = createCombatIdentity(aliases, rng, now + aliases.length);
    identities[key] = identity;
    aliases.push(identity.alias);
    changed = true;
  }
  return changed ? { ...rosterState, identities } : rosterState;
}

export function combatIdentityFor(rosterState, key) {
  return rosterState?.identities?.[key] || null;
}
export function normalizeCombatAlias(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 24);
}

export function renameCombatIdentity(rosterState, key, value) {
  const alias = normalizeCombatAlias(value);
  if (alias.length < 2) return rosterState;
  const current = rosterState?.identities?.[key];
  if (!current) return rosterState;
  const duplicate = Object.entries(rosterState.identities || {}).some(([otherKey, identity]) =>
    otherKey !== key && String(identity?.alias || '').trim().toLocaleLowerCase('es') === alias.toLocaleLowerCase('es')
  );
  if (duplicate || current.alias === alias) return rosterState;
  const record = rosterState?.unitRecords?.[current.identityId];
  return {
    ...rosterState,
    identities: {
      ...(rosterState.identities || {}),
      [key]: { ...current, alias },
    },
    unitRecords: record
      ? { ...(rosterState.unitRecords || {}), [current.identityId]: { ...record, alias } }
      : rosterState?.unitRecords,
  };
}
