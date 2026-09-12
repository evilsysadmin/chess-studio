const ROOM_FOCUS = Object.freeze({
  tournament: Object.freeze({ x: -0.72, y: 0.28, depth: 1.02, reach: 1.38, light: 0.28 }),
  train: Object.freeze({ x: -0.28, y: 0.22, depth: 0.98, reach: 1.32, light: 0.24 }),
  combat: Object.freeze({ x: 0.24, y: 0.22, depth: 1.04, reach: 1.42, light: 0.3 }),
  daily: Object.freeze({ x: 0.72, y: 0.2, depth: 1.02, reach: 1.36, light: 0.26 }),
  history: Object.freeze({ x: -1.14, y: -0.02, depth: 0.96, reach: 1.18, light: 0.2 }),
  play: Object.freeze({ x: 0, y: -0.48, depth: 1.26, reach: 1.58, light: 0.34 }),
});

const IDLE_FOCUS = Object.freeze({ x: 0, y: 0, depth: 1.18, reach: 1.45, light: 0 });

export function homeCastleRoomFocus(room) {
  return ROOM_FOCUS[room] || IDLE_FOCUS;
}

export function homeCastleKnownRoom(room) {
  return Object.prototype.hasOwnProperty.call(ROOM_FOCUS, room);
}
