import road from './campaign/road.json';
import { chroniclesApplyContentEffects } from './chroniclesContentRuntime.js';

const marker = (eventId) => `chronicles:lost-king-road:${eventId}`;
const seen = (state, eventId) => (state?.consumedContentIds || []).includes(marker(eventId));
const record = (state, eventId) => seen(state, eventId)
  ? state : { ...state, consumedContentIds: [...(state.consumedContentIds || []), marker(eventId)] };
function journal(state, entry) {
  const rows = Array.isArray(state.journal) ? state.journal : [];
  return rows.some((item) => item.id === entry.id) ? state
    : { ...state, journal: [...rows, entry] };
}
function stage(state, chapter) {
  const next = chroniclesApplyContentEffects(state, [{
    type: 'advance-quest', questId: road.questId, title: road.title,
    description: 'Busca pruebas reales de los caballeros desaparecidos.', objective: chapter.objective, order: 1,
  }]);
  return journal({ ...record(next, chapter.eventId), message: chapter.message }, chapter.journal);
}

export function chroniclesInitializeCampaignRoadQuest(state, { fresh = false } = {}) {
  if (!fresh || state?.mapId !== road.start.mapId
      || state.quests?.[road.questId] || seen(state, road.start.eventId)) return state;
  const start = chroniclesApplyContentEffects(state, [
    { type: 'start-quest', questId: road.questId, title: road.title,
      description: 'La Dama ha ordenado investigar la calzada real.', objective: road.start.objective, order: 1 },
    { type: 'grant-item', ...road.start.item, quantity: 1 },
  ]);
  return journal({ ...record(start, road.start.eventId), message: road.start.message }, road.start.journal);
}

export function chroniclesAdvanceCampaignRoadQuest(previous, next) {
  const active = previous?.quests?.[road.questId];
  if (!active || active.status !== 'active' || previous === next) return next;
  // The milestone is evidence only when its actual authored set effect fires.
  if (previous.mapId === road.clue.mapId && next.mapId === road.clue.mapId
      && previous[road.clue.flag] !== true && next[road.clue.flag] === true
      && !seen(next, road.clue.eventId)) return stage(next, road.clue);
  // Reporting requires having read the actual milestone in this run.
  if (previous.mapId === road.clue.mapId && next.mapId === road.report.mapId
      && seen(next, road.clue.eventId) && !seen(next, road.report.eventId)) return stage(next, road.report);
  return next;
}
