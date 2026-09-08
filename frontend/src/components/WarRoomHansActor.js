export const WAR_ROOM_HANS_ACTOR_VERSION = 'war-room-hans-actor-v3-routine-lease';

const HANS_NAME = 'war-room-hans-butler';
const DRIVER_NAME = 'war-room-hans-fireplace-driver';
const FIREPLACE_NAME = 'war-room-fireplace';
const CANVAS_SELECTOR = '.game-board-stack-3d .board3d-main-canvas';
const ACTORS = new WeakMap();

export function getWarRoomHansActor(root) {
  if (!root) return null;
  const cached = ACTORS.get(root);
  if (cached?.hans?.parent && cached?.driver?.parent) return cached;

  const hans = root.getObjectByName?.(HANS_NAME) || null;
  const driver = root.getObjectByName?.(DRIVER_NAME) || null;
  const fireplace = root.getObjectByName?.(FIREPLACE_NAME) || hans?.parent || null;
  const body = hans?.userData?.refs || null;
  if (!hans || !driver || !body) return null;

  const actor = {
    version: WAR_ROOM_HANS_ACTOR_VERSION,
    root,
    hans,
    driver,
    fireplace,
    body,
    canvas: null,
    side: Math.sign(Number(fireplace?.position?.x || -1)) || -1,
    routine: '',
  };
  ACTORS.set(root, actor);
  hans.userData.warRoomHansActor = WAR_ROOM_HANS_ACTOR_VERSION;
  driver.userData.warRoomHansActor = WAR_ROOM_HANS_ACTOR_VERSION;
  return actor;
}

export function getWarRoomHansCanvas(actor) {
  if (!actor) return null;
  if (actor.canvas && actor.canvas.isConnected !== false) return actor.canvas;
  actor.canvas = globalThis.document?.querySelector?.(CANVAS_SELECTOR) || null;
  return actor.canvas;
}

export function getWarRoomHansNarrativePhase(actor) {
  return getWarRoomHansCanvas(actor)?.dataset?.warRoomHansNarrativePhase || '';
}

export function getWarRoomHansRouteState(actor) {
  if (!actor?.hans) return { route: '', logicalX: 0 };
  const route = String(actor.hans.userData?.warRoomHansRoute || '');
  const x = Number(actor.hans.position?.x || 0);
  const logicalX = Number.isFinite(x) ? x / actor.side : 0;
  return { route, logicalX };
}

export function acquireWarRoomHansRoutine(actor, routineName) {
  const name = String(routineName || '').trim();
  if (!actor || !name) return false;
  if (actor.routine && actor.routine !== name) return false;
  actor.routine = name;
  actor.hans.userData.warRoomHansActiveRoutine = name;
  actor.driver.userData.warRoomHansActiveRoutine = name;
  return true;
}

export function releaseWarRoomHansRoutine(actor, routineName) {
  const name = String(routineName || '').trim();
  if (!actor || !name || actor.routine !== name) return false;
  actor.routine = '';
  actor.hans.userData.warRoomHansActiveRoutine = '';
  actor.driver.userData.warRoomHansActiveRoutine = '';
  return true;
}

export function warRoomHansRoutineAvailable(actor, routineName = '') {
  if (!actor) return false;
  const requested = String(routineName || '').trim();
  return !actor.routine || actor.routine === requested;
}

export function setWarRoomHansRuntimeState(actor, key, value) {
  if (!actor?.hans?.userData || !key) return;
  actor.hans.userData[key] = value;
}