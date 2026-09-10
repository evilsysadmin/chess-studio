import { getWarRoomHansActor } from './WarRoomHansActor.js';
import { warRoomHansChoreForEvent } from './WarRoomHansChoreContract.js';

export const WAR_ROOM_HANS_ARMOR_POLISH_GUARD_VERSION = 'hans-armor-polish-v1-hand-cloth';

const FLOOR_NAME = 'war-room-castle-floor-slab';
const CLOTH_NAME = 'war-room-hans-chore-prop-cloth';
const RIGHT_HAND_CLOTH_POSITION = Object.freeze([0.055, -0.62, 0.1]);

export function rigWarRoomHansPolishCloth(actor, cloth) {
  const rightArm = actor?.body?.rightArm;
  if (!rightArm || !cloth) return false;
  if (cloth.parent !== rightArm) rightArm.add(cloth);
  cloth.position.set(...RIGHT_HAND_CLOTH_POSITION);
  cloth.rotation.set(0.06, 0.1, 0.18);
  cloth.userData.warRoomHansClothRig = WAR_ROOM_HANS_ARMOR_POLISH_GUARD_VERSION;
  cloth.userData.warRoomHansClothHand = 'right';
  return true;
}

export function applyWarRoomHansArmorPolishPose(actor, cloth, elapsedMs = 0) {
  const body = actor?.body;
  const hans = actor?.hans;
  if (!body?.rightArm || !hans || !cloth) return false;

  const elapsed = Math.max(0, Number(elapsedMs) || 0);
  const phase = elapsed * 0.0085;
  const sweep = Math.sin(phase);
  const loop = Math.cos(phase);

  // AmbientChoreRoutine already resets the task baseline and applies its generic
  // arm reach first. These deltas turn that reach into a visible small circular
  // polishing motion while the cloth itself follows the right hand.
  body.rightArm.rotation.x -= 0.1 + sweep * 0.08;
  body.rightArm.rotation.y += loop * 0.16;
  body.rightArm.rotation.z += sweep * 0.22;
  if (body.leftArm) body.leftArm.rotation.x -= 0.1;
  if (body.torso) body.torso.rotation.x += 0.018;
  if (body.head) body.head.rotation.x += 0.045;

  cloth.rotation.z = 0.18 + sweep * 0.08;
  hans.userData.warRoomHansTaskPose = 'polish-armor';
  hans.userData.warRoomHansArmorPolish = WAR_ROOM_HANS_ARMOR_POLISH_GUARD_VERSION;
  return true;
}

export function installWarRoomHansArmorPolishGuard(root) {
  const actor = getWarRoomHansActor(root);
  const hans = actor?.hans;
  const floor = root?.getObjectByName?.(FLOOR_NAME);
  if (!actor || !hans || !floor || typeof floor.onBeforeRender !== 'function') return 0;
  if (floor.userData?.warRoomHansArmorPolishGuard === WAR_ROOM_HANS_ARMOR_POLISH_GUARD_VERSION) return 0;

  const previous = floor.onBeforeRender;
  let actingSince = null;

  floor.onBeforeRender = (...args) => {
    previous?.(...args);

    const eventName = String(hans.userData?.warRoomHansChoreEvent || '');
    const chore = warRoomHansChoreForEvent(eventName);
    const activeTask = String(hans.userData?.warRoomHansActiveTask || '');
    const activeKind = String(hans.userData?.warRoomHansActiveTaskKind || '');
    if (!activeTask || activeKind !== 'chore' || chore?.pose !== 'polish-armor') {
      actingSince = null;
      return;
    }

    const cloth = hans.getObjectByName?.(CLOTH_NAME);
    if (!cloth || !rigWarRoomHansPolishCloth(actor, cloth)) return;

    const taskPhase = String(hans.userData?.warRoomHansTaskPhase || '');
    if (taskPhase !== 'acting') {
      actingSince = null;
      return;
    }

    const now = typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
    if (actingSince == null) actingSince = now;
    applyWarRoomHansArmorPolishPose(actor, cloth, now - actingSince);
  };

  floor.userData.warRoomHansArmorPolishGuard = WAR_ROOM_HANS_ARMOR_POLISH_GUARD_VERSION;
  hans.userData.warRoomHansArmorPolishGuard = WAR_ROOM_HANS_ARMOR_POLISH_GUARD_VERSION;
  return 1;
}
