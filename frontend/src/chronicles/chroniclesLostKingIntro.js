import intro from './campaign/intro.json';
import { chroniclesApplyContentEffects } from './chroniclesContentRuntime.js';

// The authored prologue is additive and opt-in for brand-new first-person
// expeditions only. Legacy/Tactics runs never receive a synthetic quest.
function marker(eventId) { return `chronicles:lost-king:${eventId}`; }
function hasEvent(state, eventId) {
  return (state?.consumedContentIds || []).includes(marker(eventId));
}
function addEvent(state, eventId) {
  if (hasEvent(state, eventId)) return state;
  return {
    ...state,
    consumedContentIds: [...(state.consumedContentIds || []), marker(eventId)],
  };
}
function addJournal(state, entry) {
  const journal = Array.isArray(state.journal) ? state.journal : [];
  if (journal.some((row) => row.id === entry.id)) return state;
  return { ...state, journal: [...journal, entry] };
}
function advance(state, chapter) {
  const updated = chroniclesApplyContentEffects(state, [{
    type: 'advance-quest',
    questId: intro.questId,
    title: intro.title,
    description: 'Investiga la desaparición del Rey por encargo de la Dama.',
    objective: chapter.objective,
    order: 1,
  }]);
  return addJournal({
    ...addEvent(updated, chapter.eventId),
    message: chapter.message,
  }, chapter.journal);
}

export function chroniclesInitializeLostKingIntro(state, { fresh = false } = {}) {
  if (!fresh || state?.mapId !== intro.start.mapId
    || state.quests?.[intro.questId] || hasEvent(state, intro.start.eventId)) return state;
  const started = chroniclesApplyContentEffects(state, [
    {
      type: 'start-quest',
      questId: intro.questId,
      title: intro.title,
      description: 'La Dama encomienda a Matthias encontrar al Rey desaparecido.',
      objective: intro.start.objective,
      order: 1,
    },
    {
      type: 'grant-item',
      itemId: intro.start.item.itemId,
      name: intro.start.item.name,
      description: intro.start.item.description,
      quantity: 1,
    },
  ]);
  return addJournal({
    ...addEvent(started, intro.start.eventId),
    message: intro.start.message,
  }, intro.start.journal);
}

export function chroniclesAdvanceLostKingIntro(previous, next) {
  const quest = previous?.quests?.[intro.questId];
  if (!quest || quest.status !== 'active' || next === previous) return next;

  // This fires only after the real authored sigil trigger; merely arriving
  // at the crypt never fabricates the missing knight's signet.
  if (previous.mapId === intro.seal.mapId && next.mapId === intro.seal.mapId
    && previous[intro.seal.flag] !== true && next[intro.seal.flag] === true
    && !hasEvent(next, intro.seal.eventId)) {
    return advance(next, intro.seal);
  }
  // Report on actual return through the existing portal, once per run.
  if (previous.mapId === intro.seal.mapId && next.mapId === intro.report.mapId
    && hasEvent(next, intro.seal.eventId) && !hasEvent(next, intro.report.eventId)) {
    return advance(next, intro.report);
  }
  return next;
}
