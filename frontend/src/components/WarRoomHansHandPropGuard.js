import { getWarRoomHansActor } from './WarRoomHansActor.js';

export const WAR_ROOM_HANS_HAND_PROP_GUARD_VERSION = 'hans-hand-prop-guard-v1';

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

function activePropSpec(hans) {
  const kind = String(hans?.userData?.warRoomHansActiveTaskKind || '');
  if (!kind) return null;
  const eventName = kind === 'service'
    ? String(hans.userData?.warRoomHansServiceEvent || '')
    : String(hans.userData?.warRoomHansChoreEvent || '');
  return SINGLE_HAND_PROPS[`${kind}:${eventName}`] || null;
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

export function reconcileWarRoomHansSingleHandProps(actor) {
  const hans = actor?.hans;
  const spec = activePropSpec(hans);
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

export function installWarRoomHansHandPropGuard(root) {
  const actor = getWarRoomHansActor(root);
  const floor = root?.getObjectByName?.(FLOOR_NAME);
  if (!actor || !floor || typeof floor.onBeforeRender !== 'function') return 0;
  if (floor.userData?.warRoomHansHandPropGuard === WAR_ROOM_HANS_HAND_PROP_GUARD_VERSION) return 0;

  const previous = floor.onBeforeRender;
  floor.onBeforeRender = (...args) => {
    previous?.(...args);
    reconcileWarRoomHansSingleHandProps(actor);
  };

  floor.userData.warRoomHansHandPropGuard = WAR_ROOM_HANS_HAND_PROP_GUARD_VERSION;
  actor.hans.userData.warRoomHansHandPropGuard = WAR_ROOM_HANS_HAND_PROP_GUARD_VERSION;
  return 1;
}
