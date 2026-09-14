import { closeArmorGauntletsOnHilt } from './WarRoomArmorArticulation.js';
import { registerWarRoomDeferredFinalizer } from './WarRoomDeferredFinalizer.js';

export const WAR_ROOM_ARMOR_GUARD_POSE_VERSION = 'two-hand-centerline-v6';

function collectNamed(root, name) {
  const matches = [];
  root?.traverse?.((object) => {
    if (object?.name === name) matches.push(object);
  });
  return matches;
}

function partForSide(armor, name, side) {
  return collectNamed(armor, name)
    .find((object) => Math.sign(object?.position?.x || 0) === side) || null;
}

function setPartPose(object, position, rotationZ = null) {
  if (!object) return 0;
  object.position.set(...position);
  if (Number.isFinite(rotationZ)) object.rotation.set(0, 0, rotationZ);
  object.userData.warRoomArmorGuardPose = WAR_ROOM_ARMOR_GUARD_POSE_VERSION;
  return 1;
}

export function applyArmorGuardPose(armor, towardBoard = 1) {
  if (!armor) return 0;
  const sword = armor.getObjectByName?.('war-room-zweihander');
  if (!sword) return 0;

  // Keep the canonical sword anchor at y=.7, but pull its hilt into the same
  // depth plane as the hands and make the weapon read as a true centreline
  // guard. Move the grip itself by a hair over 1 cm so both derived hands stay
  // chest-high with a real margin instead of sitting on a floating-point edge.
  sword.position.y = 0.7;
  sword.position.z = towardBoard * 0.405;
  sword.rotation.z = 0;
  sword.userData.warRoomArmorGuardPose = WAR_ROOM_ARMOR_GUARD_POSE_VERSION;

  const grip = sword.getObjectByName?.('war-room-zweihander-grip');
  if (grip) {
    grip.position.y = 0.641;
    grip.userData.warRoomArmorGuardPose = WAR_ROOM_ARMOR_GUARD_POSE_VERSION;
  }

  let posed = 1;
  for (const side of [-1, 1]) {
    const forearmY = side < 0 ? 1.455 : 1.375;
    posed += setPartPose(
      partForSide(armor, 'war-room-armor-vambrace', side),
      [side * 0.135, forearmY, towardBoard * 0.335],
      side * 1.14,
    );
    posed += setPartPose(
      partForSide(armor, 'war-room-armor-vambrace-flute', side),
      [side * 0.135, forearmY, towardBoard * 0.385],
      side * 1.14,
    );
    posed += setPartPose(
      partForSide(armor, 'war-room-armor-couter', side),
      [side * 0.255, 1.415, towardBoard * 0.17],
    );
    posed += setPartPose(
      partForSide(armor, 'war-room-armor-elbow-wing', side),
      [side * 0.365, 1.415, towardBoard * 0.16],
      -side * Math.PI / 2,
    );
  }

  // Recompute the hand/finger geometry from the sword's actual hilt after the
  // full arm pose is final. This is deliberately last so visible contact is the
  // source of truth rather than independent hard-coded hand coordinates.
  const closed = closeArmorGauntletsOnHilt(armor, towardBoard);
  armor.userData.warRoomArmorGuardPose = WAR_ROOM_ARMOR_GUARD_POSE_VERSION;
  armor.userData.warRoomArmorGuardPoseHandsClosed = closed;
  armor.userData.warRoomArmorGuardPoseVisualIntent = 'hands-and-forearms-converge-on-hilt';
  return posed + closed;
}

export function applyWarRoomArmorGuardPose(root, towardBoard = 1) {
  if (!root) return 0;
  let changed = 0;
  for (const name of ['war-room-teutonic-armor-left', 'war-room-teutonic-armor-right']) {
    changed += applyArmorGuardPose(root.getObjectByName?.(name), towardBoard);
  }
  root.userData.warRoomArmorGuardPose = WAR_ROOM_ARMOR_GUARD_POSE_VERSION;
  return changed;
}

export function installWarRoomArmorGuardPose(root, { towardBoard, coarsePointer = false } = {}) {
  if (!root || !Number.isFinite(towardBoard) || coarsePointer) return 0;

  const changed = applyWarRoomArmorGuardPose(root, towardBoard);
  registerWarRoomDeferredFinalizer(root, {
    key: WAR_ROOM_ARMOR_GUARD_POSE_VERSION,
    coarsePointer: false,
    run: (sceneRoot) => applyWarRoomArmorGuardPose(sceneRoot || root, towardBoard),
  });

  root.userData.warRoomArmorGuardPoseExecution = 'immediate-plus-deferred-v6';
  return changed;
}
