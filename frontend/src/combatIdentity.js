// Identidad persistente de las piezas de Combate. El alias nace con la pieza,
// no con la veteranía. Si una baja expira y el slot recibe un reemplazo de
// nivel 1, esa identidad se elimina y se genera otra.
import { CANONICAL_ROSTER_SLOTS, rosterSlotKey } from './combat.js';

const MARTIAL_ALIASES = Object.freeze([
  'Rivas', 'Salcedo', 'Serrano', 'Varela', 'Mena', 'Galván', 'Cortés', 'Ferrer',
  'Soria', 'Navarro', 'Téllez', 'Aranda', 'Roldán', 'Vidal', 'Leiva', 'Cervera',
  'Requena', 'Montoya', 'Segura', 'Beltrán', 'Lozano', 'Robles', 'Molina', 'Ortega',
  'Dávila', 'Bravo', 'Quiroga', 'Castaño', 'Barea', 'Ledesma', 'Vega', 'Carrasco',
]);

// Primera generación de aliases. Se migran una sola vez al estilo marcial sin
// cambiar identityId, historial, rango ni servicio. Los aliases personalizados
// que no pertenecen a este catálogo antiguo se respetan.
const LEGACY_ALIASES = Object.freeze([
  'Starky', 'Hutch', 'Blockade', 'Skippy', 'Missus', 'Noodles', 'Sapper', 'Biscuit',
  'Latch', 'Bruno', 'Moxie', 'Rookster', 'Patch', 'Dusty', 'Knuckles', 'Marlow',
  'Cinder', 'Twitch', 'Mugs', 'Flick', 'Rivet', 'Pogo', 'Dagger', 'Minnie',
  'Cricket', 'Gasket', 'Pepper', 'Bunker', 'Lucky', 'Socks', 'Spanner', 'Murmur',
]);
const LEGACY_TO_MARTIAL = Object.freeze(Object.fromEntries(LEGACY_ALIASES.map((alias, index) => [alias, MARTIAL_ALIASES[index]])));

function randomToken(rng = Math.random) {
  return Math.floor(rng() * 0x7fffffff).toString(36).padStart(6, '0');
}

function migrateLegacyAliases(rosterState) {
  const identities = { ...(rosterState?.identities || {}) };
  const unitRecords = { ...(rosterState?.unitRecords || {}) };
  // El Memorial es historia, no UI viva. Nunca reescribimos el alias con el
  // que una identidad fue archivada: una baja debe conservar el nombre que
  // llevaba cuando cayó, aunque el catálogo automático cambie en versiones
  // posteriores. Sólo migran identidades ACTIVAS y su expediente activo.
  const used = new Set(
    Object.values(identities)
      .map((entry) => entry?.alias)
      .filter((alias) => alias && !LEGACY_TO_MARTIAL[alias]),
  );
  let changed = false;

  for (const [key, identity] of Object.entries(identities)) {
    const legacyAlias = identity?.alias;
    if (!legacyAlias || !LEGACY_TO_MARTIAL[legacyAlias]) continue;

    const preferred = LEGACY_TO_MARTIAL[legacyAlias];
    const alias = !used.has(preferred)
      ? preferred
      : MARTIAL_ALIASES.find((candidate) => !used.has(candidate)) || preferred;
    used.add(alias);
    identities[key] = { ...identity, alias };

    const record = identity?.identityId ? unitRecords[identity.identityId] : null;
    if (record && (!record.alias || record.alias === legacyAlias)) {
      unitRecords[identity.identityId] = { ...record, alias };
    }
    changed = true;
  }

  return changed ? { ...rosterState, identities, unitRecords } : rosterState;
}

export function createCombatIdentity(existingAliases = [], rng = Math.random, now = Date.now()) {
  const used = new Set(existingAliases.filter(Boolean));
  const available = MARTIAL_ALIASES.filter((alias) => !used.has(alias));
  const pool = available.length ? available : MARTIAL_ALIASES;
  const alias = pool[Math.floor(rng() * pool.length) % pool.length];
  return { alias, identityId: `unit-${now.toString(36)}-${randomToken(rng)}`, createdAt: new Date(now).toISOString() };
}

export function ensureCombatIdentities(rosterState, rng = Math.random, now = Date.now()) {
  const migrated = migrateLegacyAliases(rosterState || {});
  const identities = { ...(migrated?.identities || {}) };
  let changed = migrated !== rosterState;
  const aliases = Object.values(identities).map((entry) => entry?.alias).filter(Boolean);
  for (const slot of CANONICAL_ROSTER_SLOTS) {
    const key = rosterSlotKey(slot);
    if (identities[key]?.alias && identities[key]?.identityId) continue;
    const identity = createCombatIdentity(aliases, rng, now + aliases.length);
    identities[key] = identity;
    aliases.push(identity.alias);
    changed = true;
  }
  return changed ? { ...migrated, identities } : migrated;
}

export function combatIdentityFor(rosterState, key) {
  return rosterState?.identities?.[key] || null;
}
