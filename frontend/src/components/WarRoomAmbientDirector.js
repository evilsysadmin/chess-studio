import { getWarRoomCatAmbientState } from './WarRoomCatAmbient.js';

export const WAR_ROOM_AMBIENT_DIRECTOR_VERSION = 'ambient-actor-budget-v1';

const QUIET_HANS_PHASES = new Set([
  '',
  'idle',
  'not-selected',
  'reduced-motion',
  'await-canonical-iteration',
  'complete',
  'completed',
]);

export function isWarRoomHansAmbientBusy(root) {
  const hans = root?.getObjectByName?.('war-room-hans-butler') || null;
  const driver = root?.getObjectByName?.('war-room-hans-fireplace-driver') || null;
  if (!hans || hans.visible === false) return false;

  const activeTask = String(hans.userData?.warRoomHansActiveTask || '');
  const route = String(hans.userData?.warRoomHansRoute || '');
  const phase = String(driver?.userData?.warRoomHansPhase || hans.userData?.warRoomHansChoreographyPhase || '');

  if (activeTask) return true;
  if (route && route !== 'idle' && route !== 'none') return true;
  return !QUIET_HANS_PHASES.has(phase);
}

export function resolveWarRoomAmbientActor(root, { reducedMotion = false } = {}) {
  if (reducedMotion) return 'none';
  if (isWarRoomHansAmbientBusy(root)) return 'hans';
  if (getWarRoomCatAmbientState(root)?.present) return 'cat';
  return 'matthias';
}

export function markWarRoomAmbientActor(root, actor) {
  if (!root?.userData) return actor;
  root.userData.warRoomAmbientDirector = WAR_ROOM_AMBIENT_DIRECTOR_VERSION;
  root.userData.warRoomAmbientActor = actor;
  return actor;
}
