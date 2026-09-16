import {
  WAR_ROOM_HANS_EVENTS,
  WAR_ROOM_HANS_NO_GAME_CONTEXT_ID,
} from './WarRoomHansEventContract.js';
import {
  hasWarRoomHansCompletedForGame,
  markWarRoomHansCompletedForGame,
} from './WarRoomHansPerGame.js';

export const WAR_ROOM_HANS_AMBIENT_COMPLETION_VERSION = 'hans-ambient-completion-v1-effect-terminal';

const AMBIENT_EVENTS = new Set(WAR_ROOM_HANS_EVENTS.filter((eventName) => eventName !== 'fire'));
const DELIVERY_ARTIFACTS = Object.freeze({
  espresso: 'espresso',
  'bring-book': 'bring-book',
  mail: 'mail',
});

function realGameId(gameId) {
  const text = String(gameId || '').trim();
  return text && text !== WAR_ROOM_HANS_NO_GAME_CONTEXT_ID ? text : '';
}

export function warRoomHansAmbientDeliveryArtifact(eventName) {
  return DELIVERY_ARTIFACTS[String(eventName || '')] || '';
}

export function warRoomHansAmbientCompletionState(gameId, eventName) {
  const id = realGameId(gameId);
  const event = String(eventName || '');
  const eligible = Boolean(id) && AMBIENT_EVENTS.has(event);
  const completed = eligible && hasWarRoomHansCompletedForGame(id);
  return {
    completed,
    deliveryArtifact: completed ? warRoomHansAmbientDeliveryArtifact(event) : '',
  };
}

export function markWarRoomHansAmbientEffectCompleted(gameId, eventName) {
  const id = realGameId(gameId);
  const event = String(eventName || '');
  if (!id || !AMBIENT_EVENTS.has(event)) return false;
  return markWarRoomHansCompletedForGame(id);
}
