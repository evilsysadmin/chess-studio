import { getWarRoomHansActor } from './WarRoomHansActor.js';

export const WAR_ROOM_HANS_HAND_PROP_GUARD_VERSION = 'hans-hand-prop-guard-v2-two-hand-anchors';

const FLOOR_NAME = 'war-room-castle-floor-slab';
const RIGHT_HAND_POSITION = Object.freeze([0.055, -0.62, 0.08]);

const SINGLE_HAND_PROPS = Object.freeze({
  'service:water-plant': Object.freeze({
    name: 'war-room-hans-watering-can',
    position: [0.045, -0.62, 0.075],
    preserveRotation: true,
  }),
  'chore:dust-board': Object.freeze({
    name: 'war-room-hans-chore-prop-duster',
    position: RIGHT_HAND_POSITION,
    rotation: [0, 0, 0],
  }),
  'chore:sweep-ashes': Object.freeze({
    name: 'war-room-hans-chore-prop-ash-brush',
    position: [0.045, -0.62, 0.065],
    rotation: [0, 0, 0],
  }),
});

const TWO_HAND_PROPS = Object.freeze({
  'service:espresso': Object.freeze({
    name: 'war-room-hans-espresso-tray',
    torsoY: -0.60,
    forwardZ: 0.38,
    rotation: [0, 0, 0],
  }),
  'chore:bring-book': Object.freeze({
    name: 'war-room-hans-chore-prop-book',
    torsoY: -0.56,
    forwardZ: 0.32,
    rotation: [0, 0, 0],
  }),
  'chore:mail': Object.freeze({
    name: 'war-room-hans-chore-prop-letters',
    torsoY: -0.56,
    forwardZ: 0.32,
    rotation: [0, 0, 0],
  }),
});

function activeTaskKey(hans) {
  const kind = String(hans?.userData?.warRoomHansActiveTaskKind || '');
  if (!kind) return '';
  const eventName = kind === 'service'
    ? String(hans.userData?.warRoomHansServiceEvent || '')
    : String(hans.userData?.warRoomHansChoreEvent || '');
  return `${kind}:${eventName}`;
}

function inferForward(actor) {
  const logZ = Number(actor?.body?.carriedLog?.position?.z);
  if (Number.isFinite(logZ) && Math.abs(logZ) > 0.0001) return Math.sign(logZ);
  return 1;
}

export function rigWarRoomHansSingleHandProp(actor, prop, spec) {
  const rightArm = actor?.body?.rightArm;
  if (!rightArm || !prop || !spec) return false;

  const previousRotation = prop.rotation?.clone?.() || null;
  if (prop.parent !== rightArm) rightArm.add(prop);

  const position = Array.isArray(spec.position) ? spec.position : RIGHT_HAND_POSITION;
  prop.position.set(...position);
  if (Array.isArray(spec.rotation) && !spec.preserveRotation) {
    prop.rotation.set(...spec.rotation);
  } else if (spec.preserveRotation && previousRotation) {
    prop.rotation.copy(previousRotation);
  }

  prop.userData ||= {};
  prop.userData.warRoomHansHandPropRig = WAR_ROOM_HANS_HAND_PROP_GUARD_VERSION;
  prop.userData.warRoomHansHandPropHand = 'right';
  return true;
}

export function rigWarRoomHansTwoHandProp(actor, prop, spec) {
  const torso = actor?.body?.torso;
  if (!torso || !prop || !spec) return false;

  const previousRotation = prop.rotation?.clone?.() || null;
  const forward = inferForward(actor);
  if (prop.parent !== torso) torso.add(prop);

  prop.position.set(0, Number(spec.torsoY) || 0, forward * (Number(spec.forwardZ) || 0));
  if (Array.isArray(spec.rotation) && !spec.preserveRotation) {
    prop.rotation.set(...spec.rotation);
  } else if (spec.preserveRotation && previousRotation) {
    prop.rotation.copy(previousRotation);
  }

  prop.userData ||= {};
  prop.userData.warRoomHansHandPropRig = WAR_ROOM_HANS_HAND_PROP_GUARD_VERSION;
  prop.userData.warRoomHansHandPropHand = 'two-hand-torso-anchor';
  return true;
}

export function reconcileWarRoomHansSingleHandProps(actor) {
  const hans = actor?.hans;
  const spec = SINGLE_HAND_PROPS[activeTaskKey(hans)] || null;
  if (!hans?.visible || !spec) return false;

  const prop = hans.getObjectByName?.(spec.name) || null;
  if (!prop || prop.visible === false) return false;

  const rigged = rigWarRoomHansSingleHandProp(actor, prop, spec);
  if (rigged) {
    hans.userData.warRoomHansHandPropGuard = WAR_ROOM_HANS_HAND_PROP_GUARD_VERSION;
    hans.userData.warRoomHansHandPropName = spec.name;
  }
  return rigged;
}

export function reconcileWarRoomHansTwoHandProps(actor) {
  const hans = actor?.hans;
  if (!hans?.visible) return false;

  let rigged = false;
  const taskSpec = TWO_HAND_PROPS[activeTaskKey(hans)] || null;
  if (taskSpec) {
    const taskProp = hans.getObjectByName?.(taskSpec.name) || null;
    if (taskProp?.visible !== false) {
      rigged = rigWarRoomHansTwoHandProp(actor, taskProp, taskSpec) || rigged;
      if (rigged) hans.userData.warRoomHansHandPropName = taskSpec.name;
    }
  }

  const carriedLog = actor?.body?.carriedLog || null;
  if (carriedLog?.visible) {
    rigged = rigWarRoomHansTwoHandProp(actor, carriedLog, {
      torsoY: -0.31,
      forwardZ: 0.30,
      preserveRotation: true,
    }) || rigged;
    if (rigged) hans.userData.warRoomHansHandPropName = carriedLog.name || 'war-room-hans-carried-log';
  }

  if (rigged) hans.userData.warRoomHansHandPropGuard = WAR_ROOM_HANS_HAND_PROP_GUARD_VERSION;
  return rigged;
}

export function installWarRoomHansHandPropGuard(root) {
  const actor = getWarRoomHansActor(root);
  const floor = root?.getObjectByName?.(FLOOR_NAME);
  if (!actor || !floor || typeof floor.onBeforeRender !== 'function') return 0;
  if (floor.userData?.warRoomHansHandPropGuard === WAR_ROOM_HANS_HAND_PROP_GUARD_VERSION) return 0;

  const previous = floor.onBeforeRender;
  floor.onBeforeRender = (...args) => {
    previous?.(...args);
    reconcileWarRoomHansSingleHandProps(actor);
    reconcileWarRoomHansTwoHandProps(actor);
  };

  floor.userData.warRoomHansHandPropGuard = WAR_ROOM_HANS_HAND_PROP_GUARD_VERSION;
  actor.hans.userData.warRoomHansHandPropGuard = WAR_ROOM_HANS_HAND_PROP_GUARD_VERSION;
  return 1;
}
