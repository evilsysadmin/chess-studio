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

// Each War Room only offers the events its decor supports (War Room v1 has
// every prop; Blender rooms grow their list as their stage gains routines).
const BLENDER_ROOM_EVENTS = Object.freeze(['fire']);
export const WAR_ROOM_HANS_VARIANT_EVENTS = Object.freeze({
  v2: BLENDER_ROOM_EVENTS,
  v3: BLENDER_ROOM_EVENTS,
  v4: BLENDER_ROOM_EVENTS,
});

export function warRoomHansEventsForVariant(variant) {
  return WAR_ROOM_HANS_VARIANT_EVENTS[variant] || WAR_ROOM_HANS_EVENTS;
}

export function warRoomHansEventForGame(gameId, { variant = 'classic' } = {}) {
  const realGameId = normalizedRealGameId(gameId);
  if (!realGameId) return '';
  const events = warRoomHansEventsForVariant(variant);
  return events[hashGameId(realGameId) % events.length];
}

export function warRoomHansEventMatches(gameId, eventName) {
  return warRoomHansEventForGame(gameId) === String(eventName || '');
}

export function warRoomHansShouldClearDeliveredArtifacts(nextGameId, completedGameId = '') {
  const nextRealGameId = normalizedRealGameId(nextGameId);
  if (!nextRealGameId) return false;
  return nextRealGameId !== normalizedRealGameId(completedGameId);
}

export function warRoomHansAmbientDelayMs(gameId, { min = 16000, max = 42000, salt = '' } = {}) {
  const low = Math.max(0, Number(min) || 0);
  const high = Math.max(low, Number(max) || low);
  const realGameId = normalizedRealGameId(gameId);
  const hash = hashGameId(`${realGameId}:${salt}`);
  const normalized = hash / 0xffffffff;
  return Math.round(low + (high - low) * normalized);
}
