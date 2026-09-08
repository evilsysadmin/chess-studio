export const WAR_ROOM_HANS_EVENT_VERSION = 'hans-event-per-game-v2-chores';

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
  if (!gameId) return '';
  return WAR_ROOM_HANS_EVENTS[hashGameId(gameId) % WAR_ROOM_HANS_EVENTS.length];
}

export function warRoomHansEventMatches(gameId, eventName) {
  return warRoomHansEventForGame(gameId) === String(eventName || '');
}

export function warRoomHansAmbientDelayMs(gameId, { min = 16000, max = 42000, salt = '' } = {}) {
  const low = Math.max(0, Number(min) || 0);
  const high = Math.max(low, Number(max) || low);
  const hash = hashGameId(`${gameId}:${salt}`);
  const normalized = hash / 0xffffffff;
  return Math.round(low + (high - low) * normalized);
}
