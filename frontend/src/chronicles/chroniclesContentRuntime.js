import { chroniclesMapTransitionState } from './chroniclesMapCatalog.js';

const CARDINAL_DIRECTIONS = Object.freeze([
  Object.freeze({ key: 'north', dx: 0, dy: -1 }),
  Object.freeze({ key: 'east', dx: 1, dy: 0 }),
  Object.freeze({ key: 'south', dx: 0, dy: 1 }),
  Object.freeze({ key: 'west', dx: -1, dy: 0 }),
]);

const CONTENT_GROUPS = Object.freeze(['triggers', 'interactables', 'treasures', 'traps', 'exits']);

export function chroniclesItemCount(state, itemId) {
  if (!itemId) return 0;
  return Math.max(0, Number(state?.inventory?.[itemId] || 0));
}

export function chroniclesRequirementMet(state, requirement) {
  if (!requirement || typeof requirement !== 'object') return true;
  const value = requirement.itemId
    ? chroniclesItemCount(state, requirement.itemId)
    : state?.[requirement.key];
  if (Object.prototype.hasOwnProperty.call(requirement, 'equals')) return value === requirement.equals;
  if (Object.prototype.hasOwnProperty.call(requirement, 'lte')) return Number(value) <= Number(requirement.lte);
  if (Object.prototype.hasOwnProperty.call(requirement, 'gte')) return Number(value) >= Number(requirement.gte);
  if (requirement.truthy === true) return Boolean(value);
  if (requirement.falsy === true) return !value;
  return true;
}

export function chroniclesRequirementsMet(state, requirements) {
  return (requirements || []).every((requirement) => chroniclesRequirementMet(state, requirement));
}

export function chroniclesRequirementFailure(state, requirements) {
  return (requirements || []).find((requirement) => !chroniclesRequirementMet(state, requirement)) || null;
}

export function chroniclesContentEntries(map) {
  return CONTENT_GROUPS.flatMap((group) => map?.[group] || []);
}

export function chroniclesContentVisible(state, entry) {
  if (!state) return true;
  return chroniclesRequirementsMet(state, entry?.when);
}

function onCurrentCell(state, entry, tileAt) {
  if (entry?.tile) return tileAt(state.x, state.y) === entry.tile;
  if (Number.isFinite(entry?.x) && Number.isFinite(entry?.y)) return state.x === entry.x && state.y === entry.y;
  return false;
}

function adjacentExit(state, entry, tileAt) {
  return CARDINAL_DIRECTIONS
    .map((direction) => ({
      x: state.x + direction.dx,
      y: state.y + direction.dy,
      direction: direction.key,
    }))
    .find((position) => tileAt(position.x, position.y) === entry.tile) || null;
}

function interactionFromEntry(state, entry, tileAt) {
  if (!chroniclesContentVisible(state, entry)) return null;
  if (entry.kind === 'exit') {
    const position = adjacentExit(state, entry, tileAt);
    if (!position) return null;
    const unlocked = chroniclesRequirementsMet(state, entry.requirements);
    return {
      id: entry.id,
      kind: entry.kind,
      label: unlocked ? entry.openLabel : entry.lockedLabel,
      locked: !unlocked,
      ...position,
    };
  }
  if (!onCurrentCell(state, entry, tileAt)) return null;
  return {
    id: entry.id,
    kind: entry.kind,
    label: entry.label,
    x: entry.x ?? state.x,
    y: entry.y ?? state.y,
  };
}

export function chroniclesContentInteractions(state, map, tileAt) {
  return chroniclesContentEntries(map)
    .map((entry) => interactionFromEntry(state, entry, tileAt))
    .filter(Boolean);
}

export function chroniclesContentDefinition(map, id) {
  if (!id) return null;
  return chroniclesContentEntries(map).find((entry) => entry.id === id) || null;
}

export function chroniclesContentLockedMessage(state, definition, fallback = '') {
  const failure = chroniclesRequirementFailure(state, definition?.requirements);
  return failure?.message || fallback;
}

function withItemCount(state, itemId, count) {
  const inventory = { ...(state?.inventory || {}) };
  if (count > 0) inventory[itemId] = count;
  else delete inventory[itemId];
  return { ...state, inventory };
}

export function chroniclesApplyContentEffects(state, effects, adapters = {}) {
  return (effects || []).reduce((next, effect) => {
    if (effect.type === 'set' && effect.key) return { ...next, [effect.key]: effect.value };
    if (effect.type === 'transition-map' && effect.mapId) return chroniclesMapTransitionState(next, effect.mapId);
    if (effect.type === 'grant-item' && effect.itemId) {
      const amount = Math.max(1, Number(effect.amount || 1));
      return withItemCount(next, effect.itemId, chroniclesItemCount(next, effect.itemId) + amount);
    }
    if (effect.type === 'consume-item' && effect.itemId) {
      const amount = Math.max(1, Number(effect.amount || 1));
      return withItemCount(next, effect.itemId, Math.max(0, chroniclesItemCount(next, effect.itemId) - amount));
    }
    if (effect.type === 'heal-party') {
      const amount = Math.max(0, Number(effect.amount || 0));
      return {
        ...next,
        party: Array.isArray(next.party)
          ? next.party.map((member) => member.hp > 0
            ? { ...member, hp: Math.min(member.maxHp, member.hp + amount) }
            : member)
          : next.party,
      };
    }
    if (effect.type === 'refill-class-abilities' && typeof adapters.refillClassAbilities === 'function') {
      return adapters.refillClassAbilities(next);
    }
    if (typeof adapters.onUnknownEffect === 'function') return adapters.onUnknownEffect(next, effect);
    return next;
  }, state);
}

export function chroniclesApplyContentAction(state, action, adapters = {}) {
  if (!action) return state;
  let next = chroniclesApplyContentEffects(state, action.effects, adapters);
  if (action.message) next = { ...next, message: action.message };
  if (action.journal && typeof adapters.appendJournal === 'function') {
    next = adapters.appendJournal(next, action.journal);
  }
  return next;
}
