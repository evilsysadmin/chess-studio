export const WAR_ROOM_HANS_EVENT_VERSION = 'hans-event-per-game-v3-missing-context';
export const WAR_ROOM_HANS_NO_GAME_CONTEXT_ID = '__war-room-hans-no-game-context__';

export const WAR_ROOM_HANS_EVENTS = Object.freeze([
  'fire',
  'mop',
  'water-plant',
  'espresso',
  'dust-armor',
  'dust-board',
  'bring-book',
  'mail',
  'straighten-room',
  'sweep-ashes',
  'polish-brass',
]);

function normalizedRealGameId(gameId) {
  const text = String(gameId || '');
  return text === WAR_ROOM_HANS_NO_GAME_CONTEXT_ID ? '' : text;
}

function hashGameId(gameId) {
  const text = String(gameId || '');
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function warRoomHansEventForGame(gameId) {
  const realGameId = normalizedRealGameId(gameId);
  if (!realGameId) return '';
  return WAR_ROOM_HANS_EVENTS[hashGameId(realGameId) % WAR_ROOM_HANS_EVENTS.length];
}

export function warRoomHansEventMatches(gameId, eventName) {
  return warRoomHansEventForGame(gameId) === String(eventName || '');
}

export function warRoomHansAmbientDelayMs(gameId, { min = 16000, max = 42000, salt = '' } = {}) {
  const low = Math.max(0, Number(min) || 0);
  const high = Math.max(low, Number(max) || low);
  const realGameId = normalizedRealGameId(gameId);
  const hash = hashGameId(`${realGameId}:${salt}`);
  const normalized = hash / 0xffffffff;
  return Math.round(low + (high - low) * normalized);
}
