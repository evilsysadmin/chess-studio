import { chroniclesApplyContentEffects } from './chroniclesContentRuntime.js';
import { chroniclesMapForState } from './chroniclesMapCatalog.js';

// A region can greet the company once per run (`arrivalAction`): Swordhaven
// opens the main story the moment you arrive, a dungeon sets its objective.
// The receipt lives in consumedContentIds, so F5 and re-entry never replay it.
export function chroniclesArrivalMarker(mapId) {
  return `arrival:${mapId}`;
}

function addJournal(state, entry) {
  if (!entry?.id) return state;
  const journal = Array.isArray(state.journal) ? state.journal : [];
  if (journal.some((row) => row.id === entry.id)) return state;
  return { ...state, journal: [...journal, entry] };
}

export function chroniclesApplyArrival(state) {
  if (!state?.mapId || state.phase === 'escaped' || state.phase === 'defeated') return state;
  const map = chroniclesMapForState(state);
  const action = map?.arrivalAction;
  if (!action || !Array.isArray(action.effects)) return state;
  const marker = chroniclesArrivalMarker(map.id);
  const consumed = Array.isArray(state.consumedContentIds) ? state.consumedContentIds : [];
  if (consumed.includes(marker)) return state;
  let next = chroniclesApplyContentEffects(state, action.effects);
  next = { ...next, consumedContentIds: [...consumed, marker] };
  if (action.message) next = { ...next, message: action.message };
  return addJournal(next, action.journal);
}

// Reducer hook: greet only when the company actually changed region.
export function chroniclesArriveOnTransition(previous, next) {
  if (!previous || !next || next === previous || next.mapId === previous.mapId) return next;
  return chroniclesApplyArrival(next);
}
