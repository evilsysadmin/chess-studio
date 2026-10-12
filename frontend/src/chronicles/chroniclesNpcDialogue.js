import { chroniclesMapForState } from './chroniclesMapCatalog.js';

// An NPC audience is a presentation over authored campaign content. Dialogue
// choices are data, never a second implementation of quest/reward effects.
// Scripted answers are information; the action choice calls chroniclesReduce.
const NPC_SCRIPTS = Object.freeze({
  aldric: Object.freeze({
    name: 'Alcalde Aldric',
    place: 'Ayuntamiento de Swordhaven',
    room: 'aldric-hall',
    greeting: 'Aldric deja la pluma a un lado. «Decidme. Tengo un pueblo que gobernar y pocas horas de sueño».',
    topics: Object.freeze([
      Object.freeze({
        id: 'knights', label: '¿Qué sabéis de los caballeros desaparecidos?',
        answer: '«El sello de la Dama apareció en una carta, pero sus hombres nunca llegaron. Primero necesitamos asegurar Swordhaven. Después hablaremos del Camino y de Garrah».',
      }),
      Object.freeze({
        id: 'town', label: '¿Qué ocurre en Swordhaven?',
        answer: '«Hay problemas bajo nuestras bodegas. El sargento Brask vigila el Camino y la sacerdotisa Ilse atiende a los heridos. Preguntadles también a ellos».',
      }),
    ]),
  }),
  brask: Object.freeze({
    name: 'Sargento Brask',
    place: 'Cuartel de Swordhaven',
    room: 'watch-house',
    greeting: 'Brask levanta la vista de su mapa y te hace un gesto seco para que te acerques.',
    topics: Object.freeze([
      Object.freeze({
        id: 'road', label: '¿Qué ocurre en el Camino?',
        answer: '«Los desertores atacan a cualquiera que lleve provisiones. Su jefe es Garrah. No les deis ventaja».',
      }),
      Object.freeze({
        id: 'advice', label: '¿Algún consejo antes de partir?',
        answer: '«Equipamiento, raciones y los ojos abiertos. Y no confundáis una retirada táctica con una huida cobarde».',
      }),
    ]),
  }),
  ilse: Object.freeze({
    name: 'Sacerdotisa Ilse',
    place: 'Templo de Swordhaven',
    room: 'temple',
    greeting: 'Ilse deja una vela ante el altar y escucha a tu compañía con atención.',
    topics: Object.freeze([
      Object.freeze({
        id: 'wounded', label: '¿Cómo están los heridos?',
        answer: '«Cada día llegan más del Camino. Las reservas de vendas se agotan antes de que termine la semana».',
      }),
      Object.freeze({
        id: 'rookwood', label: '¿Qué sabéis de Rookwood?',
        answer: '«En el bosque habita una gran tejedora. Su seda serviría para cuidar a muchos heridos, si alguien se atreviera a traerla».',
      }),
    ]),
  }),
});

function npcScriptKey(mapId, entry) {
  if (mapId !== 'swordhaven-first-book') return null;
  if (String(entry.id).startsWith('swordhaven-mayor')) return 'aldric';
  if (String(entry.id).startsWith('first-book-watch-')) return 'brask';
  if (String(entry.id).startsWith('first-book-temple')) return 'ilse';
  return null;
}

function isNpcEntry(entry) {
  return entry && String(entry.visualType || '').startsWith('building-')
    && !entry.shop && !entry.guild;
}

export function chroniclesNpcDialogueForState(state, contextual = null) {
  if (!state?.mapId || !Number.isInteger(state.x) || !Number.isInteger(state.y)) return null;
  const map = chroniclesMapForState(state);
  const facing = [{ dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }][state.direction];
  const candidates = (map?.interactables || []).filter((entry) => (
    isNpcEntry(entry) && Boolean(npcScriptKey(state.mapId, entry))
    && ((entry.x === state.x && entry.y === state.y)
      || (facing && entry.x === state.x + facing.dx
        && entry.y === state.y + facing.dy
        && map.grid?.[entry.y]?.[entry.x] !== '#'))
  ));
  const active = candidates.find((entry) => entry.id === contextual?.id) || null;
  // Once the one-shot content has resolved, the person still lives in the
  // building and can answer ordinary questions. Never replay expired rewards.
  const entry = active || candidates.find((candidate) => npcScriptKey(state.mapId, candidate)) || candidates[0];
  if (!entry) return null;
  const scripted = NPC_SCRIPTS[npcScriptKey(state.mapId, entry)] || null;
  const name = scripted?.name || String(entry.label || 'Habitante').split(' · ')[0];
  const choices = [...(scripted?.topics || [])].map((topic) => ({
    id: topic.id, kind: 'say', label: topic.label, answer: topic.answer,
  }));
  if (active?.action && contextual?.id === active.id) {
    choices.push({
      id: 'quest', kind: 'action',
      label: contextual.locked ? (contextual.label || 'Preguntar por el encargo') : 'Hablar del encargo',
      actionId: active.id,
    });
  }
  choices.push({ id: 'leave', kind: 'leave', label: 'Despedirse y salir' });
  return {
    id: entry.id,
    name,
    place: scripted?.place || String(entry.label || 'Interior').split(' · ')[0],
    room: scripted?.room || 'generic',
    greeting: scripted?.greeting || 'El habitante te recibe. Puedes preguntar por su encargo o volver a la calle.',
    choices,
  };
}
