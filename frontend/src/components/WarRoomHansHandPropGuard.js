import * as THREE from 'three';
import { getWarRoomHansActor } from './WarRoomHansActor.js';

export const WAR_ROOM_HANS_HAND_PROP_GUARD_VERSION = 'hans-hand-prop-guard-v3-readable-espresso';

const FLOOR_NAME = 'war-room-castle-floor-slab';
const RIGHT_HAND_POSITION = Object.freeze([0.055, -0.62, 0.08]);
const ESPRESSO_TRAY_NAME = 'war-room-hans-espresso-tray';
const DELIVERED_ESPRESSO_NAME = 'war-room-hans-delivered-espresso';
const ESPRESSO_CARRIED_SCALE = 1.18;
const ESPRESSO_DELIVERED_SCALE = 1.28;

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
    name: ESPRESSO_TRAY_NAME,
    // Torso pivot sits at ~1.36m and both animated hands settle around ~1.0m
    // during the espresso pose. Keep the tray there instead of at hip height.
    torsoY: -0.34,
    forwardZ: 0.48,
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

function ensureEspressoHandle(group, cup, { name, x, y } = {}) {
  if (!group || !cup?.material || !name) return false;
  if (group.getObjectByName?.(name)) return true;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.012, 6, 16), cup.material);
  handle.name = name;
  handle.position.set(Number(x) || 0, Number(y) || 0, 0);
  handle.castShadow = true;
  group.add(handle);
  return true;
}

export function upgradeWarRoomHansEspressoVisuals(root, actor) {
  let upgraded = 0;
  const tray = actor?.hans?.getObjectByName?.(ESPRESSO_TRAY_NAME) || null;
  if (tray) {
    tray.scale.setScalar(ESPRESSO_CARRIED_SCALE);
    const platter = tray.children?.[0] || null;
    const cup = tray.children?.[1] || null;
    if (platter?.material?.color?.setHex) {
      platter.material.color.setHex(0x9b7233);
      platter.material.metalness = Math.max(Number(platter.material.metalness) || 0, 0.62);
      platter.material.roughness = Math.min(Number(platter.material.roughness) || 1, 0.32);
    }
    ensureEspressoHandle(tray, cup, {
      name: 'war-room-hans-espresso-carried-handle',
      x: 0.105,
      y: 0.09,
    });
    tray.userData.warRoomHansEspressoPresentation = 'hand-height-readable-v2';
    upgraded += 1;
  }

  const delivered = root?.getObjectByName?.(DELIVERED_ESPRESSO_NAME) || null;
  if (delivered) {
    const deskArt = delivered.parent || null;
    const drawer = deskArt?.getObjectByName?.('war-room-command-desk-drawer') || null;
    const front = Math.sign(Number(drawer?.position?.z)) || Math.sign(Number(delivered.position.z)) || 1;
    delivered.position.x = 0.88;
    delivered.position.z = front * 0.32;
    // Grow the footprint for legibility, but never scale the local Y offsets:
    // those encode the exact saucer/cup height over the desk surface.
    delivered.scale.set(ESPRESSO_DELIVERED_SCALE, 1, ESPRESSO_DELIVERED_SCALE);
    const cup = delivered.children?.[1] || null;
    ensureEspressoHandle(delivered, cup, {
      name: 'war-room-hans-espresso-delivered-handle',
      x: 0.105,
      y: 1.215,
    });
    delivered.userData.warRoomHansEspressoPresentation = 'desk-front-edge-readable-v2';
    upgraded += 1;
  }
  return upgraded;
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

  upgradeWarRoomHansEspressoVisuals(root, actor);

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
