import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadHomeCastleR2Scene } from './HomeCastle3DR2Asset.js';
import { FIRE_SPRITE_DEFAULTS, createFireSprites, createSteamSprites, disposeFireSprites, fireSpriteSeeds } from './fireSprites.js';
import { getEffectiveReducedMotion } from '../userPreferences.js';
import {
  HOME_CASTLE_3D_MOBILE_ENABLE_MIN_WIDTH,
  homeCastle3DRenderPolicy,
  tighterRuntimeLodCap,
} from './HomeCastle3DRenderPolicy.js';
import { createHomeCastle3DPerformanceGovernor } from './HomeCastle3DPerformanceGovernor.js';
import {
  HOME_MATTHIAS_ACTOR_MODEL_PATH,
  createHomeMatthiasActor,
  homeMatthiasActorRoutine,
  homeMatthiasProjectBounds,
} from './HomeBlenderMatthiasActor.js';

export const HOME_BLENDER_RUNTIME_LOGICAL_ID = 'home.scene.runtime';
export const HOME_BLENDER_RUNTIME_MIN_WIDTH = HOME_CASTLE_3D_MOBILE_ENABLE_MIN_WIDTH;
export const HOME_BLENDER_CAMERA_FOV = 22.9;

export function releaseHomeBlenderWebglContext(extension) {
  if (typeof extension?.loseContext !== 'function') return false;
  extension.loseContext();
  return true;
}

const CAMERA_BASE = Object.freeze({ x: 0, y: 4.85, z: 16 });
const CAMERA_TARGET = Object.freeze({ x: 0, y: 1.55, z: -2.3 });

// Where each destination beacon floats, in the authored Blender frame (x right, y depth
// away from the camera, z up). The runtime scene is exported Y-up, so Blender (x, y, z)
// becomes three (x, z, -y). Beacons sit just above their object so they never hide it.
export const HOME_BLENDER_BEACON_ANCHORS = Object.freeze({
  tournament: Object.freeze([-6.15, 5.83, 3.45]), // trophy on the left chimney ledge
  train: Object.freeze([-2.65, 5.7, 2.75]), // library
  combat: Object.freeze([1.55, 5.83, 4.0]), // suit of armour, above the plume
  daily: Object.freeze([4.45, 5.0, 3.62]), // "reto del día" scroll pinned above the right hearth
  history: Object.freeze([-6.65, 2.3, 2.05]), // study corner: gilt knight statuette and helmet
  dungeon: Object.freeze([6.6, 0.8, 1.9]), // above the profile stair, over the front rail
});

// Projects the beacon anchors through the live camera into fractions (0..1) of the
// canvas, so a beacon stays on its object whatever the stage aspect ratio is.
export function homeBlenderProjectAnchors(camera, anchors = HOME_BLENDER_BEACON_ANCHORS) {
  if (!camera) return null;
  camera.updateMatrixWorld?.(true);
  const layout = {};
  for (const [id, [bx, by, bz]] of Object.entries(anchors)) {
    const point = new THREE.Vector3(bx, bz, -by).project(camera);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || point.z > 1) continue;
    layout[id] = {
      x: Math.round((point.x * 0.5 + 0.5) * 10000) / 10000,
      y: Math.round((1 - (point.y * 0.5 + 0.5)) * 10000) / 10000,
    };
  }
  return layout;
}


const EXPOSURE = Object.freeze({
  dawn: 1.27,
  day: 1.22,
  dusk: 1.26,
  night: 1.32,
});

// The room used to look the same at every hour (only the exposure moved, by 8%).
// Each period now tints and rebalances the daylight-side lights: the warm key that
// stands for the sun/moon, the cool fill that comes from the tall window on the
// right, the sky colour of the hemisphere and the ambient wash. Values multiply the
// authored intensities, and the fires are untouched, so the room keeps its hearth
// glow at night and simply gets more daylight at noon. The moon disc only shows when
// there is a night-ish sky.
export const HOME_BLENDER_TIME_OF_DAY = Object.freeze({
  dawn: Object.freeze({
    ambient: Object.freeze({ color: 0xb58c73, scale: 1.0 }),
    hemi: Object.freeze({ color: 0x9aa6b9, scale: 1.0 }),
    key: Object.freeze({ color: 0xffb77f, scale: 0.98 }),
    fill: Object.freeze({ color: 0xb1909d, scale: 1.18 }),
    moon: true,
  }),
  day: Object.freeze({
    ambient: Object.freeze({ color: 0xae967d, scale: 1.12 }),
    hemi: Object.freeze({ color: 0x9fadc0, scale: 1.18 }),
    key: Object.freeze({ color: 0xffd6a0, scale: 1.14 }),
    fill: Object.freeze({ color: 0x819bc2, scale: 1.45 }),
    moon: false,
  }),
  dusk: Object.freeze({
    ambient: Object.freeze({ color: 0xa4775f, scale: 0.98 }),
    hemi: Object.freeze({ color: 0x86788f, scale: 0.94 }),
    key: Object.freeze({ color: 0xff9856, scale: 1.0 }),
    fill: Object.freeze({ color: 0x7b6688, scale: 1.15 }),
    moon: true,
  }),
  night: Object.freeze({
    ambient: Object.freeze({ color: 0x707a9b, scale: 0.9 }),
    hemi: Object.freeze({ color: 0x4a5f96, scale: 1.0 }),
    key: Object.freeze({ color: 0x9fb2e0, scale: 0.7 }),
    fill: Object.freeze({ color: 0x5a7ec4, scale: 1.5 }),
    moon: true,
  }),
});

export function homeBlenderTimeOfDayLook(ambient = 'day') {
  return HOME_BLENDER_TIME_OF_DAY[ambient] || HOME_BLENDER_TIME_OF_DAY.day;
}

const HOME_BLENDER_MOON_NAME = /window_moon/i;

export function applyHomeBlenderMoonVisibility(root, ambient = 'day') {
  const visible = homeBlenderTimeOfDayLook(ambient).moon;
  let touched = 0;
  root?.traverse?.((object) => {
    if (!HOME_BLENDER_MOON_NAME.test(String(object.name || ''))) return;
    object.visible = visible;
    touched += 1;
  });
  return touched;
}

const HOME_BLENDER_KLAUS_PART = /^HOME_PROP_cat_/i;
const HOME_BLENDER_KLAUS_STATIC = /^HOME_PROP_cat_(?:cushion|tassel)/i;

// Klaus sleeps, but he is alive: a breath you can see, a lazy tail tip, the
// odd ear flick and, once a minute or so, he lifts his head, glances at the
// hall and settles back. Distances are in Blender metres (the cat is ~0.7 m).
export const HOME_BLENDER_KLAUS_MOTION = Object.freeze({
  breathSeconds: 3.4,
  // Chest rise as a fraction of the cat's height; the rig is re-grounded so
  // the belly never sinks into the cushion.
  breatheScale: 0.022,
  breatheSpread: 0.007,
  settleX: 0.0025,
  settleZ: 0.0015,
  yaw: 0.0045,
  roll: 0.0025,
});

// Klaus ships as one node (HOME_PROP_cat_body, every material of the cat)
// plus three landmarks that place his head and ear pivots; see
// consolidate_klaus in scripts/blender/export_home_v2_runtime.py.
const HOME_BLENDER_KLAUS_LANDMARK = Object.freeze({
  nose: /^HOME_PROP_cat_nose$/i,
  earL: /^HOME_PROP_cat_ear_inner_l$/i,
  earR: /^HOME_PROP_cat_ear_inner_r$/i,
});

export const HOME_BLENDER_KLAUS_EAR_MOTION = Object.freeze({
  flickDeg: 22,
  flickSeconds: 0.42,
  // Each ear flicks on its own, mismatched clock.
  periods: Object.freeze([13.7, 19.3]),
});

// A rare wake moment: the head lifts off the paws, glances at the hall and
// settles back down.
export const HOME_BLENDER_KLAUS_HEAD_MOTION = Object.freeze({
  periodSeconds: 58,
  offsetSeconds: 9,
  riseSeconds: 0.9,
  holdSeconds: 2.6,
  settleSeconds: 1.5,
  lift: 0.022,
  pitchDeg: 12,
  yawDeg: 15,
});

// Head anatomy measured on the Blender builder (add_royal_cat): the ear
// panels sit 0.144 apart, the head centre 0.112 behind the nose and 0.010
// above it.
const KLAUS_HEAD = Object.freeze({
  earSpan: 0.144,
  centerBack: 0.112,
  centerUp: 0.01,
  pivotBack: 0.045,
  pivotDown: 0.035,
  // Soft weight: full inside `inner`, none past `outer` (ears are reached by
  // squashing the distance above the centre).
  inner: 0.118,
  outer: 0.178,
  upSquash: 0.6,
  earFrom: 0.045,
  earTo: 0.085,
  earLateralFrom: 0.018,
  earLateralTo: 0.045,
  // Only the ear lump itself: the hip is also high and to the side.
  earReachFrom: 0.07,
  earReachTo: 0.1,
  // The front paws sit low and to the sides under the chin; they stay on
  // the cushion while the head lifts off them.
  pawLateralFrom: 0.04,
  pawLateralTo: 0.065,
  pawHeightFrom: -0.045,
  pawHeightTo: -0.02,
  // Pieces that fit around the head (collar, pendant, eye slits and mouth:
  // one primitive per material) move rigidly with the weight at their centre
  // instead of stretching across the falloff and the paw gate.
  rigidRadius: 0.11,
});

function klausSmooth(value, from, to) {
  if (to === from) return value >= to ? 1 : 0;
  const t = Math.max(0, Math.min(1, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

// 0 asleep on the paws, 1 head up. Eased in and out; the glance swings from
// one side to the other while he holds the head up.
export function homeBlenderKlausHeadPose(timeMs = 0) {
  const spec = HOME_BLENDER_KLAUS_HEAD_MOTION;
  const seconds = Math.max(0, Number(timeMs) || 0) / 1000;
  const local = (((seconds - spec.offsetSeconds) % spec.periodSeconds) + spec.periodSeconds) % spec.periodSeconds;
  const rise = klausSmooth(local, 0, spec.riseSeconds);
  const holdEnd = spec.riseSeconds + spec.holdSeconds;
  const settle = 1 - klausSmooth(local, holdEnd, holdEnd + spec.settleSeconds);
  const up = Math.min(rise, settle);
  const glance = Math.sin(Math.min(1, local / holdEnd) * Math.PI * 1.5 - Math.PI * 0.25);
  return {
    up,
    lift: up * spec.lift,
    pitch: THREE.MathUtils.degToRad(up * spec.pitchDeg),
    yaw: THREE.MathUtils.degToRad(up * glance * spec.yawDeg),
  };
}

// Ear flick angle (radians, outwards) for ear 0 or 1. Ears perk a little while
// the head is up.
export function homeBlenderKlausEarPose(timeMs = 0, index = 0) {
  const spec = HOME_BLENDER_KLAUS_EAR_MOTION;
  const seconds = Math.max(0, Number(timeMs) || 0) / 1000;
  const period = spec.periods[index % spec.periods.length];
  const local = ((seconds + index * 4.1) % period + period) % period;
  const flick = local < spec.flickSeconds ? Math.sin((local / spec.flickSeconds) * Math.PI) : 0;
  const perk = homeBlenderKlausHeadPose(timeMs).up * 0.35;
  return THREE.MathUtils.degToRad(spec.flickDeg) * Math.max(flick, perk);
}

export function homeBlenderIsKlausPart(name = '') {
  const normalized = String(name || '');
  return HOME_BLENDER_KLAUS_PART.test(normalized) && !HOME_BLENDER_KLAUS_STATIC.test(normalized);
}

export function homeBlenderKlausPose(timeMs = 0) {
  const seconds = Math.max(0, Number(timeMs) || 0) / 1000;
  const motion = HOME_BLENDER_KLAUS_MOTION;
  // Asymmetric breath: a quicker inhale, a longer, softer exhale.
  const phase = (seconds / motion.breathSeconds) % 1;
  const breath = phase < 0.4
    ? klausSmooth(phase, 0, 0.4)
    : 1 - klausSmooth(phase, 0.4, 1);
  const settle = Math.sin(seconds * (Math.PI * 2 / 17.0) + 0.8);
  const tinyShift = Math.sin(seconds * (Math.PI * 2 / 23.0) + 2.1);
  return {
    breath,
    scaleY: 1 + breath * motion.breatheScale,
    scaleXZ: 1 + breath * motion.breatheSpread,
    offsetX: settle * motion.settleX,
    offsetZ: tinyShift * motion.settleZ,
    yaw: settle * motion.yaw,
    roll: tinyShift * motion.roll,
  };
}

const klausRodrigues = (point, pivot, axis, angle, out) => {
  out.copy(point).sub(pivot).applyAxisAngle(axis, angle).add(pivot);
  return out;
};

// Soft-skins Klaus's head and ears onto the single metaball body mesh and the
// separate face pieces, in rig space. Returns null when the GLB lacks the eye
// and ear landmarks (older exports): then he only breathes and sways.
function prepareKlausHeadDeform(rig, parts) {
  const byName = (pattern) => parts.find((part) => pattern.test(String(part.name || '')));
  const nose = byName(HOME_BLENDER_KLAUS_LANDMARK.nose);
  const ears = [byName(HOME_BLENDER_KLAUS_LANDMARK.earL), byName(HOME_BLENDER_KLAUS_LANDMARK.earR)];
  if (!nose || ears.some((part) => !part)) return null;

  rig.updateMatrixWorld(true);
  const toRig = rig.matrixWorld.clone().invert();
  const centerOf = (object) => new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3()).applyMatrix4(toRig);
  const earCenters = ears.map(centerOf);
  const scale = earCenters[0].distanceTo(earCenters[1]) / KLAUS_HEAD.earSpan;
  if (!(scale > 1e-6)) return null;
  const up = new THREE.Vector3(0, 1, 0).transformDirection(toRig);
  const noseCenter = centerOf(nose);
  const earsMid = earCenters[0].clone().add(earCenters[1]).multiplyScalar(0.5);
  const forward = noseCenter.clone().sub(earsMid);
  forward.addScaledVector(up, -forward.dot(up));
  if (forward.lengthSq() < 1e-10) return null;
  forward.normalize();
  const center = noseCenter.clone()
    .addScaledVector(forward, -KLAUS_HEAD.centerBack * scale)
    .addScaledVector(up, KLAUS_HEAD.centerUp * scale);
  const pivot = center.clone()
    .addScaledVector(forward, -KLAUS_HEAD.pivotBack * scale)
    .addScaledVector(up, -KLAUS_HEAD.pivotDown * scale);
  const side = new THREE.Vector3().crossVectors(up, forward).normalize();
  const earFrames = earCenters.map((earCenter) => {
    const lateral = earCenter.clone().sub(center);
    lateral.addScaledVector(up, -lateral.dot(up)).addScaledVector(forward, -lateral.dot(forward));
    const lateralDir = lateral.lengthSq() > 1e-10 ? lateral.normalize() : side.clone();
    return {
      lateral: lateralDir,
      // Rotating about up x lateral swings the tip outwards for a positive angle.
      axis: new THREE.Vector3().crossVectors(up, lateralDir).normalize(),
      center: earCenter,
      pivot: center.clone()
        .addScaledVector(up, KLAUS_HEAD.earFrom * scale)
        .addScaledVector(lateralDir, earCenter.clone().sub(center).dot(lateralDir)),
    };
  });

  const headWeight = (point) => {
    const offset = point.clone().sub(center);
    const along = offset.dot(up);
    const flat = offset.clone().addScaledVector(up, -along);
    const vertical = along > 0 ? along * KLAUS_HEAD.upSquash : along;
    const distance = Math.sqrt(flat.lengthSq() + vertical * vertical) / scale;
    const radial = 1 - klausSmooth(distance, KLAUS_HEAD.inner, KLAUS_HEAD.outer);
    const sideways = Math.abs(offset.dot(side)) / scale;
    const paw = klausSmooth(sideways, KLAUS_HEAD.pawLateralFrom, KLAUS_HEAD.pawLateralTo)
      * (1 - klausSmooth(along / scale, KLAUS_HEAD.pawHeightFrom, KLAUS_HEAD.pawHeightTo));
    return radial * (1 - paw);
  };
  const earWeight = (point, frame) => {
    const offset = point.clone().sub(center);
    const height = offset.dot(up) / scale;
    const lateral = offset.dot(frame.lateral) / scale;
    const reach = point.distanceTo(frame.center) / scale;
    return klausSmooth(height, KLAUS_HEAD.earFrom, KLAUS_HEAD.earTo)
      * klausSmooth(lateral, KLAUS_HEAD.earLateralFrom, KLAUS_HEAD.earLateralTo)
      * (1 - klausSmooth(reach, KLAUS_HEAD.earReachFrom, KLAUS_HEAD.earReachTo));
  };

  const meshes = [];
  const landmarks = new Set([nose, ...ears]);
  for (const part of parts) {
    const landmark = landmarks.has(part);
    part.traverse((node) => {
      const position = node.isMesh ? node.geometry?.getAttribute?.('position') : null;
      if (!position) return;
      const toMesh = node.matrixWorld.clone().premultiply(toRig);
      const fromRig = toMesh.clone().invert();
      const rest = new Float32Array(position.count * 3);
      const indices = [];
      const weights = [];
      const point = new THREE.Vector3();
      const sphere = new THREE.Box3().setFromBufferAttribute(position).applyMatrix4(toMesh)
        .getBoundingSphere(new THREE.Sphere());
      // The landmarks follow the per-vertex weights of the skin they sit on.
      const rigid = !landmark && sphere.radius < KLAUS_HEAD.rigidRadius * scale
        ? [headWeight(sphere.center), earWeight(sphere.center, earFrames[0]), earWeight(sphere.center, earFrames[1])]
        : null;
      for (let index = 0; index < position.count; index += 1) {
        point.fromBufferAttribute(position, index);
        rest[index * 3] = point.x;
        rest[index * 3 + 1] = point.y;
        rest[index * 3 + 2] = point.z;
        point.applyMatrix4(toMesh);
        const head = rigid ? rigid[0] : headWeight(point);
        const earA = rigid ? rigid[1] : earWeight(point, earFrames[0]);
        const earB = rigid ? rigid[2] : earWeight(point, earFrames[1]);
        if (head <= 0 && earA <= 0 && earB <= 0) continue;
        indices.push(index);
        weights.push(head, earA, earB, point.x, point.y, point.z);
      }
      if (!indices.length) return;
      // Several meshes can share one geometry in a GLB; deform a private copy.
      node.geometry = node.geometry.clone();
      const geometry = node.geometry;
      geometry.computeBoundingSphere?.();
      if (geometry.boundingSphere) geometry.boundingSphere.radius += 0.05 * scale;
      meshes.push({
        node,
        attribute: geometry.getAttribute('position'),
        fromRig,
        rest,
        indices: Uint32Array.from(indices),
        weights: Float32Array.from(weights),
      });
    });
  }
  if (!meshes.length) return null;
  return {
    meshes,
    up,
    forward,
    side,
    center,
    pivot,
    ears: earFrames,
    scale,
    active: false,
  };
}

const klausScratch = {
  point: new THREE.Vector3(),
  ear: new THREE.Vector3(),
  head: new THREE.Vector3(),
  turned: new THREE.Vector3(),
  quaternion: new THREE.Quaternion(),
  pitchQuaternion: new THREE.Quaternion(),
};

// Applies the head lift/glance and ear flicks. Untouched while asleep: the
// buffers are only rewritten while something moves, plus once to settle.
export function applyHomeBlenderKlausHeadDeform(deform, timeMs = 0) {
  if (!deform) return false;
  const head = homeBlenderKlausHeadPose(timeMs);
  const earAngles = [homeBlenderKlausEarPose(timeMs, 0), homeBlenderKlausEarPose(timeMs, 1)];
  const moving = head.up > 1e-4 || earAngles[0] > 1e-4 || earAngles[1] > 1e-4;
  if (!moving && !deform.active) return false;
  deform.active = moving;
  const { point, ear, turned, quaternion, pitchQuaternion } = klausScratch;
  quaternion.setFromAxisAngle(deform.up, head.yaw);
  pitchQuaternion.setFromAxisAngle(deform.side, -head.pitch);
  quaternion.multiply(pitchQuaternion);
  const lift = head.lift * deform.scale;
  for (const mesh of deform.meshes) {
    const { attribute, rest, indices, weights, fromRig } = mesh;
    for (let n = 0; n < indices.length; n += 1) {
      const index = indices[n];
      const base = n * 6;
      const headWeight = weights[base];
      point.set(weights[base + 3], weights[base + 4], weights[base + 5]);
      for (let e = 0; e < 2; e += 1) {
        const weight = weights[base + 1 + e];
        if (weight <= 0 || earAngles[e] <= 0) continue;
        const frame = deform.ears[e];
        klausRodrigues(point, frame.pivot, frame.axis, earAngles[e] * weight, ear);
        point.copy(ear);
      }
      if (headWeight > 0 && head.up > 0) {
        turned.copy(point).sub(deform.pivot).applyQuaternion(quaternion).add(deform.pivot);
        turned.addScaledVector(deform.up, lift);
        point.lerp(turned, headWeight);
      }
      if (!moving) {
        attribute.setXYZ(index, rest[index * 3], rest[index * 3 + 1], rest[index * 3 + 2]);
        continue;
      }
      point.applyMatrix4(fromRig);
      attribute.setXYZ(index, point.x, point.y, point.z);
    }
    attribute.needsUpdate = true;
  }
  return true;
}

export function prepareHomeBlenderKlausRig(root) {
  if (!root?.traverse || !root?.add || !root?.worldToLocal) return null;
  const parts = [];
  root.updateMatrixWorld?.(true);
  root.traverse((object) => {
    if (object !== root && homeBlenderIsKlausPart(object.name) && object.parent) parts.push(object);
  });
  if (!parts.length) return null;

  const bounds = new THREE.Box3();
  let hasBounds = false;
  for (const part of parts) {
    const box = new THREE.Box3().setFromObject(part);
    if (box.isEmpty()) continue;
    bounds.union(box);
    hasBounds = true;
  }
  if (!hasBounds) return null;

  const pivot = root.worldToLocal(bounds.getCenter(new THREE.Vector3()).clone());
  const rig = new THREE.Group();
  rig.name = 'HOME_RUNTIME_KlausRig';
  rig.position.copy(pivot);
  root.add(rig);
  rig.updateMatrixWorld(true);

  for (const part of parts) rig.attach(part);
  rig.updateMatrixWorld(true);
  // Half the cat's height in rig units: breathing scales about the centre, so
  // the rig rises by the same amount to keep the belly on the cushion.
  const rigScale = rig.getWorldScale(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  rig.userData.homeKlausBase = {
    position: rig.position.clone(),
    scale: rig.scale.clone(),
    rotation: rig.rotation.clone(),
    halfHeight: (size.y / 2) / Math.max(Math.abs(rigScale.y), 1e-6),
  };
  rig.userData.homeKlausHead = prepareKlausHeadDeform(rig, parts);
  return rig;
}

export function applyHomeBlenderKlausMotion(rig, timeMs = 0) {
  const base = rig?.userData?.homeKlausBase;
  if (!base) return false;
  const pose = homeBlenderKlausPose(timeMs);
  rig.position.set(
    base.position.x + pose.offsetX,
    base.position.y + (pose.scaleY - 1) * (base.halfHeight || 0),
    base.position.z + pose.offsetZ,
  );
  rig.scale.set(base.scale.x * pose.scaleXZ, base.scale.y * pose.scaleY, base.scale.z * pose.scaleXZ);
  rig.rotation.copy(base.rotation);
  rig.rotation.y += pose.yaw;
  rig.rotation.z += pose.roll;
  applyHomeBlenderKlausHeadDeform(rig.userData.homeKlausHead, timeMs);
  rig.updateMatrixWorld?.(true);
  return true;
}

function stableFirePhase(name = '') {
  let hash = 2166136261;
  for (let index = 0; index < name.length; index += 1) {
    hash ^= name.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 1000) / 1000 * Math.PI * 2;
}

export const HOME_BLENDER_DUST = { count: 140, x: 3.2, yMin: 1.6, yMax: 5.2, zMin: -4.6, zMax: 0.4 };

export function homeBlenderDustSeeds(count = HOME_BLENDER_DUST.count) {
  let state = 0x9e3779b9;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const box = HOME_BLENDER_DUST;
  return Array.from({ length: count }, () => ({
    x: (next() * 2 - 1) * box.x,
    y: box.yMin + next() * (box.yMax - box.yMin),
    z: box.zMin + next() * (box.zMax - box.zMin),
    phase: next() * Math.PI * 2,
    speed: 0.04 + next() * 0.05,
  }));
}

export function homeBlenderDustPosition(seed, timeMs = 0) {
  const box = HOME_BLENDER_DUST;
  const t = timeMs / 1000;
  const span = box.yMax - box.yMin;
  const fall = ((seed.y - box.yMin - seed.speed * t) % span + span) % span;
  return [
    seed.x + Math.sin(t * 0.21 + seed.phase) * 0.22,
    box.yMin + fall,
    seed.z + Math.cos(t * 0.17 + seed.phase * 1.3) * 0.18,
  ];
}

// Blender window centre (7.82, 6.5, 4.3) -> three (7.82, 4.3, -6.5); the moon light lands near (4.35, 1.25, -1.85).
export const HOME_BLENDER_MOON_SHAFT = {
  from: [7.9, 4.3, -6.35],
  to: [4.1, 0.15, -1.6],
  radiusTop: 0.42,
  radiusBottom: 1.25,
  opacity: 0.32,
};

export function homeBlenderMoonShaftPose(shaft = HOME_BLENDER_MOON_SHAFT) {
  const from = new THREE.Vector3(...shaft.from);
  const to = new THREE.Vector3(...shaft.to);
  const dir = to.clone().sub(from);
  return {
    length: dir.length(),
    center: from.clone().add(to).multiplyScalar(0.5),
    quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.normalize()),
  };
}

// GPU fire lives in fireSprites.js (shared with the War Room); these keep the Home API.
export const HOME_BLENDER_FIRE_PARTICLES = FIRE_SPRITE_DEFAULTS;
export const homeBlenderFireSeeds = (count = FIRE_SPRITE_DEFAULTS.count, salt = 1) => fireSpriteSeeds(count, salt);

// Candles and torches: one Points draw call for every small flame. Each flame owns a few
// sprites that rise a hand's breadth, warm yellow at the wick turning amber, so the flame
// glows and licks instead of being a static teardrop.
export const HOME_BLENDER_CANDLE_PARTICLES = { perFlame: 8, height: 0.20, size: 0.15, spread: 0.012 };

export function homeBlenderCandleBases(nodes) {
  const out = [];
  for (const node of nodes || []) {
    if (node.kind !== 'candle') continue;
    const pos = new THREE.Vector3();
    node.object.getWorldPosition(pos);
    out.push([pos.x, pos.y, pos.z]);
  }
  return out;
}

export function homeBlenderCandleAttributes(bases, cfg = HOME_BLENDER_CANDLE_PARTICLES) {
  const seeds = homeBlenderFireSeeds(bases.length * cfg.perFlame, 7);
  const base = new Float32Array(seeds.length * 3);
  const seed = new Float32Array(seeds.length * 4);
  seeds.forEach((sd, i) => {
    const b = bases[Math.floor(i / cfg.perFlame)];
    base.set(b, i * 3);
    seed.set([sd.x / HOME_BLENDER_FIRE_PARTICLES.spreadX * cfg.spread, sd.z / HOME_BLENDER_FIRE_PARTICLES.spreadZ * cfg.spread, sd.speed * 1.4, sd.phase], i * 4);
  });
  return { base, seed, count: seeds.length };
}

const CANDLE_PARTICLE_VERTEX = `
attribute vec4 aSeed; attribute vec3 aBase;
uniform float uTime; uniform float uHeight; uniform float uSize; uniform float uViewportH;
varying float vLife;
void main() {
  float life = fract(aSeed.w + uTime * aSeed.z);
  vec3 p = aBase + vec3(aSeed.x * (1.0 - life) + sin(uTime * 3.1 + aSeed.w * 40.0) * 0.006 * life, life * uHeight, aSeed.y * (1.0 - life));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(1.0, uSize * (1.0 - life * 0.6) * projectionMatrix[1][1] * uViewportH * 0.5 / -mv.z);
  vLife = life;
}`;

const CANDLE_PARTICLE_FRAGMENT = `
uniform float uOpacity; varying float vLife;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  vec3 col = mix(vec3(1.0, 0.80, 0.36), vec3(0.95, 0.42, 0.08), smoothstep(0.0, 1.0, vLife));
  gl_FragColor = vec4(col, a * a * (1.0 - vLife) * smoothstep(0.0, 0.12, vLife) * uOpacity);
}`;

export function homeBlenderSteamBase(nodes) {
  const steam = (nodes || []).filter((node) => node.kind === 'steam');
  if (!steam.length) return null;
  const pos = steam.map((node) => node.object.getWorldPosition(new THREE.Vector3()));
  return [
    pos.reduce((sum, v) => sum + v.x, 0) / pos.length,
    Math.min(...pos.map((v) => v.y)) - 0.12, // the baked wisp starts above the rim; root the puffs on it
    pos.reduce((sum, v) => sum + v.z, 0) / pos.length,
  ];
}

export function homeBlenderFireHearthBases(nodes) {
  const groups = { left: [], right: [] };
  for (const node of nodes || []) {
    if (!node.hearth || (node.kind !== 'flame' && node.kind !== 'hot')) continue;
    const pos = new THREE.Vector3();
    node.object.getWorldPosition(pos);
    groups[node.hearth].push(pos);
  }
  return Object.entries(groups)
    .filter(([, list]) => list.length)
    .map(([hearth, list]) => ({
      hearth,
      base: [
        list.reduce((sum, v) => sum + v.x, 0) / list.length,
        Math.min(...list.map((v) => v.y)),
        list.reduce((sum, v) => sum + v.z, 0) / list.length,
      ],
    }));
}

export function homeBlenderFireKind(name = '') {
  const normalized = String(name).toLowerCase();
  if (normalized.includes('home_prop_table_mug_steam')) return 'steam';
  if (
    normalized.includes('home_prop_chandelier_flame_')
    || normalized.includes('_mantel_flame_')
    || normalized.includes('_candle_flame')
    || normalized.includes('home_prop_torch_flame_')
  ) return 'candle';
  if (!normalized.includes('home_prop_fireplace_')) return null;
  if (normalized.includes('ember')) return 'ember';
  if (normalized.includes('_hot_') || normalized.endsWith('_hot')) return 'hot';
  if (
    normalized.includes('_flame_')
    || normalized.includes('_tongue_')
    || normalized.includes('_front_base_')
  ) return 'flame';
  return null;
}

// Fire never repeats: it is built from smooth value noise at a few unrelated
// rates instead of summed sines, so no flame settles into an audible loop.
function fireLattice(index, seed) {
  let hash = Math.imul(index | 0, 374761393) ^ Math.imul(seed | 0, 668265263);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}

function fireNoise(seconds, rate, seed) {
  const t = seconds * rate;
  const cell = Math.floor(t);
  const fraction = t - cell;
  const eased = fraction * fraction * (3 - 2 * fraction);
  const value = fireLattice(cell, seed) * (1 - eased) + fireLattice(cell + 1, seed) * eased;
  return value * 2 - 1;
}

export function homeBlenderFireMotion({
  timeMs = 0,
  phase = 0,
  kind = 'flame',
} = {}) {
  const seconds = Math.max(0, Number(timeMs) || 0) / 1000;
  const seed = Math.floor(Math.abs(Number(phase) || 0) * 997) + 13;
  // One slow draught shared by every flame, so a hearth leans together.
  const gust = fireNoise(seconds, 0.33, 7);
  const body = (
    fireNoise(seconds, 4.4, seed) * 0.60
    + fireNoise(seconds, 7.3, seed + 101) * 0.28
    + fireNoise(seconds, 10.9, seed + 211) * 0.12
  );
  const drift = fireNoise(seconds, 0.9, seed + 307);
  const flick = fireNoise(seconds, 8.6, seed + 401);

  if (kind === 'candle') {
    return {
      scaleX: 1 - body * 0.030,
      scaleY: 1 + body * 0.070,
      scaleZ: 1 - body * 0.030,
      lean: fireNoise(seconds, 2.6, seed + 503) * 0.050 + gust * 0.015,
      emission: 0.95 + flick * 0.045,
      // A candle or torch flame throws a light that wavers with it.
      light: 0.90 + body * 0.09 + drift * 0.07,
    };
  }
  if (kind === 'ember') {
    // Embers breathe slowly instead of flickering.
    const glow = fireNoise(seconds, 1.6, seed + 601);
    return {
      scaleX: 1 + glow * 0.015,
      scaleY: 1 + glow * 0.012,
      scaleZ: 1 + glow * 0.015,
      lean: 0,
      emission: 0.93 + glow * 0.06 + flick * 0.02,
      light: 0.97 + glow * 0.03,
    };
  }

  const hot = kind === 'hot';
  const stretch = body * (hot ? 0.75 : 1) + drift * 0.30;
  return {
    scaleX: 1 - stretch * (hot ? 0.030 : 0.045),
    scaleY: 1 + stretch * (hot ? 0.070 : 0.105) + Math.max(0, body) * 0.02,
    scaleZ: 1 - stretch * (hot ? 0.030 : 0.045),
    lean: fireNoise(seconds, 3.4, seed + 503) * (hot ? 0.030 : 0.045) + gust * (hot ? 0.020 : 0.035),
    emission: 0.95 + flick * 0.05 + body * 0.035,
    light: 0.95 + body * 0.05 + flick * 0.03 + drift * 0.02,
  };
}

// Coffee steam: each wisp loops (fade in, rise, swell, sway, fade out) on its own
// phase so the cup never pulses in unison. `height` is the wisp's own height, so
// the motion scales with whatever size the GLB ships.
export function homeBlenderSteamMotion({ timeMs = 0, phase = 0, height = 0.4 } = {}) {
  const seconds = Math.max(0, Number(timeMs) || 0) / 1000;
  const offset = ((Number(phase) || 0) / (Math.PI * 2)) % 1;
  const period = 4.2 + offset * 1.6;
  const progress = ((seconds / period) + offset + 1) % 1;
  const envelope = Math.sin(Math.PI * progress) ** 1.25;
  return {
    progress,
    opacity: 0.30 * envelope,
    rise: progress * height * 0.55,
    swayX: Math.sin((seconds * 1.15) + (Number(phase) || 0)) * height * 0.055 * (0.4 + progress),
    swayZ: Math.cos((seconds * 0.9) + (Number(phase) || 0) * 1.7) * height * 0.035,
    // The authored wisp is a thin tube; it swells into a soft plume as it rises.
    scaleXZ: 1.8 + progress * 3.2,
    scaleY: 0.85 + progress * 0.30,
  };
}

// The published runtime GLB was exported with every flame panel's origin at the
// world origin (vertices carry the world position), so scaling or leaning it would
// swing it across the room. Seat the pivot on the flame's own base instead, and
// move the node by the same amount so nothing shifts. A GLB that is already
// pivoted on its base is left untouched.
export function rebaseFlameToPivot(object) {
  const source = object?.geometry;
  if (!source?.attributes?.position) return false;
  source.computeBoundingBox();
  const box = source.boundingBox;
  const pivot = new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2);
  if (pivot.lengthSq() < 0.02 * 0.02) return false;
  const geometry = source.clone();
  geometry.translate(-pivot.x, -pivot.y, -pivot.z);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  object.geometry = geometry;
  object.position.add(pivot.multiply(object.scale).applyQuaternion(object.quaternion));
  object.updateMatrixWorld?.(true);
  return true;
}

// Software rasterisers (SwiftShader, llvmpipe...) draw the whole room on the CPU, so
// re-rendering it for a flickering fire would starve the page. The render call
// itself returns quickly (the work happens in the GPU process), so the cost cannot
// be measured reliably from the main thread: recognise the renderer by name.
export function homeBlenderIsSoftwareRenderer(rendererName = '') {
  return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(String(rendererName));
}

function readRendererName(renderer) {
  try {
    const gl = renderer?.getContext?.();
    const info = gl?.getExtension?.('WEBGL_debug_renderer_info');
    return info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) || '') : '';
  } catch {
    return '';
  }
}

// The fire re-renders the whole room every few frames, which is only worth it when
// a frame is cheap. Two signals decide that: how long the render call takes on the
// main thread, and how late requestAnimationFrame arrives. The second matters
// because WebGL rasterises in the GPU process, so with software GL or a weak GPU the
// render call returns quickly while frames still back up. Stretch the interval so
// the fire stays a small share of the thread, and stop it (leaving the authored
// still frame) only when a frame is truly unaffordable. The render call is mostly
// three.js CPU overhead for ~1200 meshes, so a desktop with a modest CPU (and a
// strong GPU) legitimately measures 30-60 ms: that must slow the fire down, not
// kill it. Only a CPU-throttled 2x laptop already crossed the old 24 ms limit.
export const HOME_BLENDER_FIRE_MIN_SAMPLES = 6;
export const HOME_BLENDER_FIRE_MAX_RENDER_MS = 80;
export const HOME_BLENDER_FIRE_MAX_FRAME_GAP_MS = 60;
export const HOME_BLENDER_FIRE_MAX_INTERVAL_MS = 200;
export const HOME_BLENDER_FIRE_WARMUP_FRAMES = 20;

export function homeBlenderFireFramePlan({
  baseIntervalMs = 42,
  renderCostMs = 0,
  frameGapMs = 0,
  samples = 0,
} = {}) {
  const cost = Math.max(0, Number(renderCostMs) || 0);
  const gap = Math.max(0, Number(frameGapMs) || 0);
  if (samples < HOME_BLENDER_FIRE_MIN_SAMPLES) {
    return { enabled: true, intervalMs: baseIntervalMs };
  }
  // Severe jank must degrade cadence, never permanently kill the shared Home
  // animation loop. Matthias, Klaus, fire, steam and practical-light motion all
  // advance from this RAF, so a transient GC/compositor stall must be recoverable.
  // The EWMA inputs naturally let cadence tighten again once the stall clears.
  if (cost > HOME_BLENDER_FIRE_MAX_RENDER_MS || gap > HOME_BLENDER_FIRE_MAX_FRAME_GAP_MS) {
    return { enabled: true, intervalMs: HOME_BLENDER_FIRE_MAX_INTERVAL_MS };
  }
  return { enabled: true, intervalMs: Math.min(HOME_BLENDER_FIRE_MAX_INTERVAL_MS, Math.max(baseIntervalMs, cost * 3)) };
}

// The exported flame materials are dark orange *lit* surfaces with an almost zero
// emissive term, so the hearth point light sitting on top of them floods the
// panels, and AgX tone mapping then desaturates any bright value to pink-white.
// A flame is a light source: kill the diffuse response, give it its own orange or
// amber emission, and keep it out of tone mapping so it stays a saturated flame.
export const HOME_BLENDER_FLAME_LOOK = Object.freeze({
  flame: Object.freeze({ emissive: 0xff4a08, intensity: 1 }),
  hot: Object.freeze({ emissive: 0xff9a1e, intensity: 1 }),
  candle: Object.freeze({ emissive: 0xffa030, intensity: 1 }),
});

export function applyFlameLook(material, kind) {
  const look = HOME_BLENDER_FLAME_LOOK[kind];
  if (!look || !material) return false;
  material.color?.setRGB?.(0.015, 0.004, 0);
  material.emissive?.setHex?.(look.emissive);
  if ('emissiveIntensity' in material) material.emissiveIntensity = look.intensity;
  if ('roughness' in material) material.roughness = 1;
  if ('metalness' in material) material.metalness = 0;
  material.toneMapped = false;
  material.needsUpdate = true;
  return true;
}

// Flat orange emission makes every flame a cut-out blob. Real flames are darker and
// redder at the base and yellow-white at the tip, so the emission is graded along the
// flame's own height (object-space y between the geometry bounds). The base value is
// a multiplier on the authored orange and the tip a hot yellow scaled by the same
// intensity, so the animated emissiveIntensity keeps driving the flicker.
export const HOME_BLENDER_FLAME_GRADIENT = Object.freeze({
  base: Object.freeze([0.95, 0.40, 0.28]),
  tip: Object.freeze([1.0, 0.60, 0.10]),
  from: 0.25,
  to: 1.0,
});

export function flameHeightRange(geometry) {
  if (!geometry) return null;
  geometry.computeBoundingBox?.();
  const box = geometry.boundingBox;
  if (!box) return null;
  const min = box.min.y;
  const max = box.max.y;
  return max - min > 1e-5 ? { min, max } : null;
}

// Rigid scale-and-lean made every flame read as a solid cut-out. With `flutter`, the
// vertex shader also waves the flame the way a real one moves: the base stays put and
// the tip whips sideways (with the tip weighted by height squared), on a few unrelated
// frequencies per flame. `material.userData.flameTime` is the uniform to advance.
export function applyFlameGradient(material, range, flutter = null) {
  if (!material || !range) return false;
  const { base, tip, from, to } = HOME_BLENDER_FLAME_GRADIENT;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFlameMin = { value: range.min };
    shader.uniforms.uFlameMax = { value: range.max };
    let vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vFlameY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFlameY = position.y;');
    if (flutter) {
      shader.uniforms.uFlameTime = { value: 0 };
      shader.uniforms.uFlutterAmp = { value: flutter.amp };
      shader.uniforms.uFlutterPhase = { value: flutter.phase };
      material.userData.flameTime = shader.uniforms.uFlameTime;
      vertexShader = vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform float uFlameMin;\nuniform float uFlameMax;\nuniform float uFlameTime;\nuniform float uFlutterAmp;\nuniform float uFlutterPhase;',
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float flameH = max(uFlameMax - uFlameMin, 1e-4);
          float flameLift = clamp((position.y - uFlameMin) / flameH, 0.0, 1.0);
          float flameTip = flameLift * flameLift;
          float wA = sin(uFlameTime * 3.3 + uFlutterPhase + flameLift * 5.0);
          float wB = sin(uFlameTime * 5.9 + uFlutterPhase * 1.7 + flameLift * 9.0 + position.x * 7.0);
          float wC = sin(uFlameTime * 1.7 + uFlutterPhase * 0.6);
          transformed.x += (wA * 0.55 + wB * 0.25 + wC * 0.40) * uFlutterAmp * flameH * flameTip;
          transformed.z += (wB * 0.40 + wA * 0.20 - wC * 0.30) * uFlutterAmp * flameH * flameTip;
          transformed.y -= abs(wA * wB) * 0.06 * flameH * flameTip;`,
        );
    }
    shader.vertexShader = vertexShader;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying float vFlameY;\nuniform float uFlameMin;\nuniform float uFlameMax;',
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float flameT = smoothstep(${from.toFixed(2)}, ${to.toFixed(2)},
          clamp((vFlameY - uFlameMin) / max(uFlameMax - uFlameMin, 1e-4), 0.0, 1.0));
        float flameGain = max(max(emissive.r, emissive.g), emissive.b);
        totalEmissiveRadiance = mix(
          totalEmissiveRadiance * vec3(${base.map((v) => v.toFixed(2)).join(',')}),
          vec3(${tip.map((v) => v.toFixed(2)).join(',')}) * flameGain,
          flameT);`,
      );
  };
  material.customProgramCacheKey = () => (flutter ? 'home-flame-gradient-flutter' : 'home-flame-gradient');
  material.needsUpdate = true;
  return true;
}

function prepareRuntimeFireRig(root) {
  const nodes = [];
  root?.traverse?.((object) => {
    if (!object?.isMesh) return;
    const kind = homeBlenderFireKind(object.name);
    if (!kind) return;
    object.castShadow = false;
    if (kind === 'flame' || kind === 'hot' || kind === 'steam') rebaseFlameToPivot(object);

    if (Array.isArray(object.material)) {
      object.material = object.material.map((material) => material?.clone?.() || material);
    } else if (object.material?.clone) {
      object.material = object.material.clone();
    }

    for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
      if (kind === 'steam') {
        material.transparent = true;
        material.depthWrite = false;
        material.opacity = 0;
        material.needsUpdate = true;
        continue;
      }
      if (kind !== 'ember') applyFlameLook(material, kind);
      if (kind !== 'ember') {
        applyFlameGradient(material, flameHeightRange(object.geometry), {
          amp: kind === 'candle' ? 0.055 : 0.15,
          phase: stableFirePhase(object.name),
        });
      }
    }

    const materials = (Array.isArray(object.material) ? object.material : [object.material])
      .filter(Boolean)
      .map((material) => ({
        material,
        emissiveIntensity: Number(material.emissiveIntensity) || 0,
      }));

    const lowered = object.name.toLowerCase();
    object.geometry?.computeBoundingBox?.();
    const wispBox = object.geometry?.boundingBox;
    nodes.push({
      object,
      kind,
      basePosition: object.position.clone(),
      height: wispBox ? Math.max(0.05, wispBox.max.y - wispBox.min.y) : 0.4,
      hearth: lowered.includes('fireplace_left') ? 'left' : lowered.includes('fireplace_right') ? 'right' : null,
      phase: stableFirePhase(object.name),
      baseScale: object.scale.clone(),
      baseRotationZ: object.rotation.z,
      materials,
    });
  });
  return nodes;
}

function applyRuntimeFireMotion(nodes, timeMs) {
  const light = { left: { sum: 0, count: 0 }, right: { sum: 0, count: 0 } };
  for (const node of nodes) {
    if (node.kind === 'steam') {
      const steam = homeBlenderSteamMotion({ timeMs, phase: node.phase, height: node.height });
      node.object.position.set(
        node.basePosition.x + steam.swayX,
        node.basePosition.y + steam.rise,
        node.basePosition.z + steam.swayZ,
      );
      node.object.scale.set(
        node.baseScale.x * steam.scaleXZ,
        node.baseScale.y * steam.scaleY,
        node.baseScale.z * steam.scaleXZ,
      );
      for (const { material } of node.materials) material.opacity = steam.opacity;
      continue;
    }
    const motion = homeBlenderFireMotion({
      timeMs,
      phase: node.phase,
      kind: node.kind,
    });
    node.object.scale.set(
      node.baseScale.x * motion.scaleX,
      node.baseScale.y * motion.scaleY,
      node.baseScale.z * motion.scaleZ,
    );
    node.object.rotation.z = node.baseRotationZ + motion.lean;
    const seconds = timeMs / 1000;
    for (const { material } of node.materials) {
      if (material.userData?.flameTime) material.userData.flameTime.value = seconds;
    }
    for (const { material, emissiveIntensity } of node.materials) {
      if ('emissiveIntensity' in material) {
        material.emissiveIntensity = emissiveIntensity * motion.emission;
      }
    }
    if ((node.kind === 'flame' || node.kind === 'hot') && light[node.hearth]) {
      light[node.hearth].sum += motion.light - 1;
      light[node.hearth].count += 1;
    }
  }
  // Each hearth throws its own light, driven by the mean of its own flames.
  // The mean of ~10 independent flames cancels most of its own swing, so amplify what is left.
  const factor = ({ sum, count }) => THREE.MathUtils.clamp(1 + (count ? sum / count : 0) * 3.4, 0.80, 1.18);
  return { left: factor(light.left), right: factor(light.right) };
}


const HOME_BLENDER_PORTRAIT_HORIZONTAL_FOV = 18.5;
// Tall phone canvases used to widen the vertical lens to ~39° at 390/430px.
// That preserved peripheral room context but exposed a large empty band above
// the authored hall. Keep some portrait context while letting the architecture
// fill the viewport. A 35.5° ceiling restores a little lateral castle context at\n// 390/430px without returning to the old ~39° ceiling runway; projected beacons\n// remain tied to the live camera.
const HOME_BLENDER_PORTRAIT_MAX_VERTICAL_FOV = 35.5;

export function homeBlenderCameraFovForAspect(aspect = 16 / 9) {
  const safeAspect = Number.isFinite(Number(aspect)) && Number(aspect) > 0
    ? Number(aspect)
    : 16 / 9;
  if (safeAspect >= 1) return HOME_BLENDER_CAMERA_FOV;

  const horizontalRadians = HOME_BLENDER_PORTRAIT_HORIZONTAL_FOV * Math.PI / 180;
  const portraitVerticalFov = 2 * Math.atan(
    Math.tan(horizontalRadians / 2) / safeAspect,
  ) * 180 / Math.PI;
  const blend = Math.min(1, Math.max(0, (1 - safeAspect) / 0.20));
  return Math.min(
    HOME_BLENDER_PORTRAIT_MAX_VERTICAL_FOV,
    Math.max(
      HOME_BLENDER_CAMERA_FOV,
      HOME_BLENDER_CAMERA_FOV
        + (portraitVerticalFov - HOME_BLENDER_CAMERA_FOV) * blend,
    ),
  );
}

export function homeBlenderCameraPoseForAspect(aspect = 16 / 9) {
  const safeAspect = Number.isFinite(Number(aspect)) && Number(aspect) > 0
    ? Number(aspect)
    : 16 / 9;
  if (safeAspect >= 1) return { position: CAMERA_BASE, target: CAMERA_TARGET };

  // Phone portrait needs a touch more physical breathing room around the board,
  // not another large lens change. Pull back only 0.45m while keeping the same
  // authored sightline so side furnishings separate without shrinking desktop.
  const portraitBlend = Math.min(1, Math.max(0, (1 - safeAspect) / 0.20));
  return {
    position: { ...CAMERA_BASE, z: CAMERA_BASE.z + 0.45 * portraitBlend },
    target: CAMERA_TARGET,
  };
}

export function homeBlenderRuntimePolicy({
  viewportWidth = 0,
  devicePixelRatio = 1,
  hardwareConcurrency = 4,
  runtimeLodCap = null,
} = {}) {
  return homeCastle3DRenderPolicy({
    viewportWidth,
    devicePixelRatio,
    hardwareConcurrency,
    runtimeLodCap,
  });
}

function browserPolicy(runtimeLodCap = null) {
  if (typeof window === 'undefined') {
    return homeBlenderRuntimePolicy({ runtimeLodCap });
  }
  return homeBlenderRuntimePolicy({
    runtimeLodCap,
    viewportWidth: window.innerWidth,
    devicePixelRatio: window.devicePixelRatio || 1,
    hardwareConcurrency: typeof navigator !== 'undefined'
      ? (navigator.hardwareConcurrency || 4)
      : 4,
  });
}

export function homeBlenderRuntimeEligible() {
  if (typeof window === 'undefined') return false;
  const policy = browserPolicy();
  return window.innerWidth >= HOME_BLENDER_RUNTIME_MIN_WIDTH
    && policy.enabled
    && policy.lod !== '2d';
}

export function homeBlenderPolicyNeedsFallback(policy) {
  return !policy?.enabled || policy?.lod === '2d';
}

export function homeBlenderAdaptiveLodFloor(policy) {
  // Once the browser has proved capable enough to enter the Blender Home, runtime
  // performance adaptation may shed expensive effects but must not eject the user
  // to the static painted fallback. This matters especially on phones, which enter
  // directly at lite quality even on strong GPUs such as recent Adreno devices.
  return policy?.enabled && policy?.lod !== '2d' ? 'lite' : '2d';
}


// Wall-torch x positions from the authored Blender scene (Blender x maps to three x).
const HOME_BLENDER_TORCH_X = Object.freeze([-8.0, -4.15, 2.45, 7.95]);

// The lite LOD lacks IBL, torch lights and shadows; lift what it does have.
const HOME_BLENDER_LITE_EXPOSURE_BOOST = 1.75;
const HOME_BLENDER_LITE_AMBIENT_BOOST = 2.6;

// Flames and candles were a bright shape with a hard edge and no halo, so they read
// as stickers. Each practical light now carries a soft additive sprite (a radial
// gradient, no post-processing pass) whose opacity follows the same flicker as the
// light behind it. The ratio is clamped so a deep dip in the noise never blacks the
// glow out and a spike never blows it out.
export function homeBlenderGlowOpacity(base = 0, lightRatio = 1) {
  const ratio = Math.min(1.4, Math.max(0.5, Number(lightRatio) || 0));
  return Math.min(1, Math.max(0, Number(base) * ratio));
}

function createGlowTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.18, 'rgba(255,255,255,0.55)');
  gradient.addColorStop(0.5, 'rgba(255,255,255,0.14)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createGlowSprite(texture, color, size, opacity, position) {
  const material = new THREE.SpriteMaterial({
    map: texture,
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.position.copy(position);
  sprite.scale.set(size, size, 1);
  sprite.renderOrder = 5;
  return sprite;
}

function addRuntimeLights(scene, shadowsEnabled = true, ambientPeriod = 'day') {
  // Keep the browser rendition close to the authored Blender beauty pass:
  // dark stone stays dark and the warm practicals shape the room instead of
  // a large ambient wash flattening every material.
  const lift = shadowsEnabled ? 1 : HOME_BLENDER_LITE_AMBIENT_BOOST;
  const ambient = new THREE.AmbientLight(0x9b806b, 0.20 * lift);
  const hemi = new THREE.HemisphereLight(0x8198b8, 0x2a1208, 0.36 * lift);

  const key = new THREE.DirectionalLight(0xffc18a, 1.62);
  key.position.set(-5.2, 7.4, 8.2);
  key.castShadow = shadowsEnabled;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -9;
  key.shadow.camera.right = 9;
  key.shadow.camera.top = 8;
  key.shadow.camera.bottom = -3;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 28;
  key.shadow.bias = -0.00014;
  key.shadow.normalBias = 0.016;
  key.shadow.radius = 1.8;
  key.shadow.intensity = 0.72;

  const fill = new THREE.DirectionalLight(0x587aa8, 0.31);
  fill.position.set(7.2, 4.8, 5.6);

  const leftHearth = new THREE.PointLight(0xff6f24, 26, 8.5, 2);
  leftHearth.position.set(-6.15, 0.95, -5.12);

  const rightHearth = new THREE.PointLight(0xff6b21, 27, 8.5, 2);
  rightHearth.position.set(4.50, 1.10, -5.00);

  const table = new THREE.PointLight(0xffb66f, 3.35, 7.4, 2);
  table.position.set(0, 4.9, 3.8);

  const floorBounce = new THREE.PointLight(0xff8b45, 2.15, 8.8, 2);
  floorBounce.position.set(0, 0.55, -1.6);

  // The authored Blender scene lights the armour with dedicated rim and front
  // lights; the runtime had none, so the dark steel read as a black silhouette.
  // A narrow, soft-edged cool spot aimed at the suit lets its plates catch a
  // highlight without spilling onto the board, whose colours must stay honest.
  const look = homeBlenderTimeOfDayLook(ambientPeriod);
  ambient.color.setHex(look.ambient.color);
  ambient.intensity *= look.ambient.scale;
  hemi.color.setHex(look.hemi.color);
  hemi.intensity *= look.hemi.scale;
  key.color.setHex(look.key.color);
  key.intensity *= look.key.scale;
  fill.color.setHex(look.fill.color);
  fill.intensity *= look.fill.scale;

  const armour = new THREE.SpotLight(0xb9c6da, 26, 6, 0.36, 0.75, 2);
  armour.position.set(1.4, 3.6, -3.4);
  armour.target.position.set(1.5, 2.2, -5.7);
  armour.castShadow = false;

  // The four wall torches carry a point light in the Blender scene but had none in
  // the runtime, so they were bright flames that lit nothing around them. Full LOD
  // only: every extra light is paid by every material.
  const torches = shadowsEnabled
    ? HOME_BLENDER_TORCH_X.map((x) => {
      const light = new THREE.PointLight(0xff8a3c, 7, 6, 2);
      light.position.set(x, 3.15, -5.5);
      light.userData.glow = { size: 1.05, opacity: 0.5 };
      return light;
    })
    : [];
  // The Dungeon's two fire pits sit under the gate at the foot of the stairs and glow
  // up the steps in the Blender scene; the runtime ignored them, so the stairs read as
  // flat dark slabs. A warm light from below gives them relief and life, and it wavers
  // with the torches. Full LOD only, like them.
  if (shadowsEnabled) {
    const dungeon = new THREE.PointLight(0xff5a18, 9, 6, 2);
    dungeon.position.set(6.42, -0.45, -1.05);
    torches.push(dungeon);

    // Three more flames that light the Blender scene but not the runtime: the eight
    // candles of the chandelier (one light at their centre), the candle on the table
    // and the reading light at the library desk. Positions map Blender (x, y, z) to
    // three (x, z, -y). Kept modest: the chandelier hangs right over the board, whose
    // colours must stay honest.
    // A narrow warm spot under the chandelier, aimed at the board. The broad point light below
    // lifts everything and, pushed hard, flattens the board's contrast; a cone leaves a visible
    // pool of light on the table (which is what candlelight from a chandelier actually does)
    // and falls off into shadow around it. It wavers with the candles like the other flames.
    const boardPool = new THREE.SpotLight(0xffb26a, 30, 8, 0.36, 0.9, 2);
    boardPool.position.set(0, 4.5, -2.2);
    boardPool.target.position.set(0, 1.3, -1.05);
    boardPool.castShadow = false;
    scene.add(boardPool.target);
    torches.push(boardPool);

    for (const [color, intensity, distance, x, y, z, glowSize] of [
      // The chandelier is the natural light over the board. At 3.6 it barely reached the
      // pieces (about 0.27 at the board after inverse-square falloff from 3.65 m up), so they
      // read dull; this level lifts them while its warm colour keeps the squares honest.
      [0xffa050, 16, 6.8, 0, 4.5, -2.2, 0],
      [0xff9040, 3.2, 3.4, -2.72, 1.9, -1.4, 0.55],
      [0xff9648, 3.2, 3.6, -3.1, 1.5, -3.76, 0.55],
      // The three lanterns on the profile stair's front rail: they give the step treads (in
      // shadow otherwise) a raking warm light, one per third of the flight.
      [0xff7a30, 3.0, 3.2, 5.59, 1.00, -0.28, 0.5],
      [0xff7a30, 3.0, 3.2, 6.40, 0.53, -0.28, 0.5],
      [0xff7a30, 3.0, 3.2, 7.21, 0.06, -0.28, 0.5],
    ]) {
      const light = new THREE.PointLight(color, intensity, distance, 2);
      light.position.set(x, y, z);
      if (glowSize) light.userData.glow = { size: glowSize, opacity: 0.5 };
      torches.push(light);
    }
  }

  scene.add(ambient, hemi, key, fill, leftHearth, rightHearth, table, floorBounce, armour, armour.target, ...torches);

  const glowTexture = createGlowTexture();
  const glows = [];
  if (glowTexture) {
    for (const light of torches) {
      const spec = light.userData.glow;
      if (!spec) continue;
      const sprite = createGlowSprite(glowTexture, light.color, spec.size, spec.opacity, light.position);
      scene.add(sprite);
      glows.push({ sprite, light, lightBase: light.intensity, base: spec.opacity, hearth: null });
    }
    for (const [hearth, side] of [[leftHearth, 'left'], [rightHearth, 'right']]) {
      const sprite = createGlowSprite(glowTexture, hearth.color, 2.6, 0.30, hearth.position);
      scene.add(sprite);
      glows.push({ sprite, light: hearth, lightBase: hearth.intensity, base: 0.30, hearth: side });
    }
  }
  const disposeGlows = () => {
    for (const glow of glows) glow.sprite.material.dispose();
    glowTexture?.dispose?.();
  };

  return {
    glows,
    disposeGlows,
    torches: torches.map((light, index) => ({
      light,
      base: light.intensity,
      // A stable phase per torch, so the four never flicker in step.
      phase: stableFirePhase(`home_torch_light_${index}`),
    })),
    leftHearth,
    rightHearth,
    leftHearthBase: leftHearth.intensity,
    rightHearthBase: rightHearth.intensity,
  };
}

function installHomeEnvironment(renderer, scene, enabled = true) {
  if (!enabled) return () => {};
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const target = pmrem.fromScene(room, 0.035);
  pmrem.dispose();

  scene.environment = target.texture;
  scene.environmentIntensity = 0.20;

  return () => {
    if (scene.environment === target.texture) scene.environment = null;
    target.dispose?.();
    room.traverse?.((object) => {
      object.geometry?.dispose?.();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.filter(Boolean).forEach((material) => material.dispose?.());
    });
  };
}


function disposeMaterial(material) {
  if (!material) return;
  for (const value of Object.values(material)) {
    if (value?.isTexture) value.dispose();
  }
  material.dispose?.();
}

function disposeRuntimeScene(root) {
  root?.traverse?.((object) => {
    object.geometry?.dispose?.();
    if (Array.isArray(object.material)) object.material.forEach(disposeMaterial);
    else disposeMaterial(object.material);
  });
}

export function disposeStaleHomeBlenderGltf(gltf, stale) {
  if (!stale) return false;
  disposeRuntimeScene(gltf?.scene);
  return true;
}

// The chandelier lights the board from above, so it lifts the squares and the tops of the pieces
// but not the sides the camera sees, and raising it further only flattens the board's contrast.
// Candle light also bounces off the table onto the pieces from every side, which the runtime has
// no light for, so the pieces get a small warm emissive lift instead (light pieces more than
// dark ones). The squares are left alone: their colours must stay honest.
export const HOME_BLENDER_PIECE_LIFT = Object.freeze({
  light: Object.freeze({ color: 0x7c5a2c, intensity: 1 }),
  dark: Object.freeze({ color: 0x0e0e12, intensity: 1 }),
});

export function applyHomeBlenderPieceLift(root) {
  let lifted = 0;
  root?.traverse?.((object) => {
    if (!object?.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      const match = /piece_(light|dark)/i.exec(String(material?.name || ''));
      if (!match || !material.emissive) continue;
      const lift = HOME_BLENDER_PIECE_LIFT[match[1].toLowerCase()];
      material.emissive.setHex(lift.color);
      material.emissiveIntensity = lift.intensity;
      material.needsUpdate = true;
      lifted += 1;
    }
  });
  return lifted;
}

function prepareRuntimeScene(root, shadowsEnabled = true, renderer = null) {
  const maxAnisotropy = Math.min(
    8,
    renderer?.capabilities?.getMaxAnisotropy?.() || 1,
  );
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = shadowsEnabled;
    object.receiveShadow = shadowsEnabled;
    if (Array.isArray(object.material)) {
      object.material.forEach((material) => {
        if (!material) return;
        for (const texture of [
          material.map,
          material.normalMap,
          material.roughnessMap,
          material.metalnessMap,
          material.aoMap,
        ]) {
          if (!texture?.isTexture) continue;
          texture.anisotropy = Math.max(texture.anisotropy || 1, maxAnisotropy);
          texture.needsUpdate = true;
        }
        material.dithering = true;
        material.needsUpdate = true;
      });
    } else if (object.material) {
      for (const texture of [
        object.material.map,
        object.material.normalMap,
        object.material.roughnessMap,
        object.material.metalnessMap,
        object.material.aoMap,
      ]) {
        if (!texture?.isTexture) continue;
        texture.anisotropy = Math.max(texture.anisotropy || 1, maxAnisotropy);
        texture.needsUpdate = true;
      }
      object.material.dithering = true;
      object.material.needsUpdate = true;
    }
  });
}

export default function HomeBlenderScene3D({
  ambient = 'day',
  onUnavailable = null,
  onAnchorLayout = null,
  matthias = null,
  onMatthiasLayout = null,
}) {
  const canvasRef = useRef(null);
  const renderRequestRef = useRef(null);
  const matthiasPropsRef = useRef(matthias);
  const matthiasLayoutRef = useRef(onMatthiasLayout);
  const matthiasApplyRef = useRef(null);
  matthiasPropsRef.current = matthias;
  matthiasLayoutRef.current = onMatthiasLayout;
  const glContextRef = useRef(null);
  const glLoseContextRef = useRef(null);
  const [contextGeneration, setContextGeneration] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const initialPolicy = browserPolicy();
    // Any session that qualified for the Blender Home keeps a 3D floor. Desktop may
    // shed full-only effects and phones already start at lite, but runtime jank alone
    // must never turn a live castle into the static painted fallback.
    const adaptiveLodFloor = homeBlenderAdaptiveLodFloor(initialPolicy);
    // Same governor and cap as the legacy Home: sustained jank tightens quality.
    // The Blender scene decided its LOD once at mount and never degraded before this.
    let lodCap = null;
    let performanceGovernor = createHomeCastle3DPerformanceGovernor(initialPolicy.lod);
    const effectsAllowed = () => lodCap == null && initialPolicy.lod === 'full';
    if (!canvas || !homeBlenderRuntimeEligible()) {
      onUnavailable?.();
      return undefined;
    }

    canvas.classList.remove('is-ready');
    canvas.dataset.homeBlenderRuntime = 'loading';

    let disposed = false;
    let fallbackRequested = false;
    let model = null;
    let fireRig = [];
    let klausRig = null;
    let matthiasActor = null;
    let lastActorTickAt = null;
    let dust = null;
    let shaft = null;
    const fireParticles = [];
    const ensureSteamSprites = () => {
      if (fireParticles.some((points) => points.userData.steam) || !fireRig.length) return;
      const base = homeBlenderSteamBase(fireRig);
      if (!base) return;
      const points = createSteamSprites({ base, salt: 5, name: 'home-coffee-steam' });
      points.userData.steam = true;
      scene.add(points);
      fireParticles.push(points);
      // The baked wisp is a hard-edged ribbon; the soft puffs replace it while they run.
      for (const node of fireRig) if (node.kind === 'steam') node.object.visible = false;
    };
    const ensureCandleParticles = () => {
      if (fireParticles.some((points) => points.userData.candles) || !fireRig.length) return;
      for (const node of fireRig) {
        if (node.kind !== 'candle') continue;
        for (const { material } of node.materials) {
          material.transparent = true;
          material.opacity = 0.7;
          material.depthWrite = false;
          material.needsUpdate = true;
        }
      }
      const bases = homeBlenderCandleBases(fireRig);
      if (!bases.length) return;
      const cfg = HOME_BLENDER_CANDLE_PARTICLES;
      const attrs = homeBlenderCandleAttributes(bases, cfg);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(attrs.count * 3), 3));
      geometry.setAttribute('aBase', new THREE.BufferAttribute(attrs.base, 3));
      geometry.setAttribute('aSeed', new THREE.BufferAttribute(attrs.seed, 4));
      const material = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 }, uHeight: { value: cfg.height }, uSize: { value: cfg.size },
          uViewportH: { value: canvas.height || 900 }, uOpacity: { value: 1.0 },
        },
        vertexShader: CANDLE_PARTICLE_VERTEX,
        fragmentShader: CANDLE_PARTICLE_FRAGMENT,
      });
      const points = new THREE.Points(geometry, material);
      points.frustumCulled = false;
      points.renderOrder = 6;
      points.userData.candles = true;
      scene.add(points);
      fireParticles.push(points);
    };
    const ensureFireParticles = () => {
      if (fireParticles.length || !fireRig.length) return;
      const cfg = HOME_BLENDER_FIRE_PARTICLES;
      // The baked tongues are hard-edged: let the soft particles show through them.
      for (const node of fireRig) {
        if (node.kind !== 'flame' && node.kind !== 'hot') continue;
        for (const { material } of node.materials) {
          material.transparent = true;
          material.opacity = 0.62;
          material.depthWrite = false;
          material.needsUpdate = true;
        }
      }
      for (const { hearth, base } of homeBlenderFireHearthBases(fireRig)) {
        const points = createFireSprites({ base, salt: hearth === 'left' ? 1 : 2, name: `home-fire-${hearth}` });
        scene.add(points);
        fireParticles.push(points);
      }
    };
    const moveFireParticles = (timestamp) => {
      for (const points of fireParticles) {
        points.material.uniforms.uTime.value = timestamp / 1000;
        points.material.uniforms.uViewportH.value = canvas.height || 900;
      }
    };
    const ensureMoonShaft = () => {
      if (shaft || !homeBlenderTimeOfDayLook(ambient).moon) return;
      const cfg = HOME_BLENDER_MOON_SHAFT;
      const pose = homeBlenderMoonShaftPose(cfg);
      const material = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: { uColor: { value: new THREE.Color(0x8fb2ee) }, uOpacity: { value: cfg.opacity } },
        vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ float along = pow(vUv.y, 1.1); float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.6); gl_FragColor = vec4(uColor, along * edge * uOpacity); }',
      });
      shaft = new THREE.Mesh(new THREE.CylinderGeometry(cfg.radiusTop, cfg.radiusBottom, pose.length, 24, 1, true), material);
      shaft.position.copy(pose.center);
      shaft.quaternion.copy(pose.quaternion);
      shaft.frustumCulled = false;
      shaft.renderOrder = 5;
      scene.add(shaft);
    };
    const dustSeeds = homeBlenderDustSeeds();
    const ensureDust = () => {
      if (dust) return;
      const size = 32;
      const swatch = document.createElement('canvas');
      swatch.width = size;
      swatch.height = size;
      const ctx = swatch.getContext('2d');
      const grad = ctx?.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      if (!ctx || !grad) return;
      grad.addColorStop(0, 'rgba(255,225,170,1)');
      grad.addColorStop(1, 'rgba(255,225,170,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(dustSeeds.length * 3), 3));
      const material = new THREE.PointsMaterial({
        size: 0.05, map: new THREE.CanvasTexture(swatch), color: 0xffd9a0, transparent: true,
        opacity: 0.38, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      dust = new THREE.Points(geometry, material);
      dust.frustumCulled = false;
      scene.add(dust);
    };
    const moveDust = (timestamp) => {
      if (!dust) return;
      const attr = dust.geometry.getAttribute('position');
      dustSeeds.forEach((seed, i) => {
        const [x, y, z] = homeBlenderDustPosition(seed, timestamp);
        attr.setXYZ(i, x, y, z);
      });
      attr.needsUpdate = true;
    };
    let fireFrame = null;
    let lastFireRenderedAt = Number.NEGATIVE_INFINITY;
    let frame = null;
    let loadTimer = null;
    let contextRecoveryTimer = null;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: initialPolicy.antialias,
        powerPreference: initialPolicy.powerPreference,
      });
    } catch {
      onUnavailable?.();
      return undefined;
    }

    const gl = renderer.getContext();
    glContextRef.current = gl;
    glLoseContextRef.current = gl?.getExtension?.('WEBGL_lose_context') || null;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = initialPolicy.lod === 'full';
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // The room is static and only emissive flames move, so the shadow map is
    // computed once instead of re-rasterising every mesh on each animated frame.
    renderer.shadowMap.autoUpdate = false;
    renderer.toneMapping = THREE.AgXToneMapping;
    // The lite LOD (phones, small windows) drops the IBL environment, the torch lights
    // and shadows, so the same exposure leaves the room ~2.5x darker than on desktop
    // (measured on staging: luma 14.5 vs 35.7). Compensate with more exposure.
    renderer.toneMappingExposure = (EXPOSURE[ambient] || EXPOSURE.day)
      * (initialPolicy.lod === 'full' ? 1 : HOME_BLENDER_LITE_EXPOSURE_BOOST);
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const releaseEnvironment = installHomeEnvironment(
      renderer,
      scene,
      initialPolicy.lod === 'full',
    );
    // Keep haze behind the playing surface: foreground remains crisp while the
    // rear architecture picks up a restrained warm atmospheric falloff.
    scene.fog = new THREE.Fog(0x170d09, 20, 34);
    const runtimeLights = addRuntimeLights(scene, initialPolicy.lod === 'full', ambient);

    const camera = new THREE.PerspectiveCamera(
      HOME_BLENDER_CAMERA_FOV,
      16 / 9,
      0.1,
      80,
    );

    const renderFrame = () => {
      if (disposed || !model) return;
      camera.position.set(CAMERA_BASE.x, CAMERA_BASE.y, CAMERA_BASE.z);
      camera.lookAt(CAMERA_TARGET.x, CAMERA_TARGET.y, CAMERA_TARGET.z);
      renderer.render(scene, camera);
    };

    const requestRender = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        renderFrame();
      });
    };
    renderRequestRef.current = requestRender;

    const baseFireIntervalMs = initialPolicy.lod === 'full' ? 42 : 66;
    let fireIntervalMs = baseFireIntervalMs;
    let fireRenderCostMs = 0;
    let fireSamples = 0;
    let fireFrameGapMs = 0;
    let fireRafCount = 0;
    let lastFireRafAt = null;
    // Drop the extra GPU effects and shadows in place (no scene reload), then re-read the
    // capped policy for pixel ratio; '2d' hands the Home back to the painted master.
    const applyLodCap = (next) => {
      const requested = adaptiveLodFloor === 'lite' && next === '2d' ? 'lite' : next;
      lodCap = tighterRuntimeLodCap(lodCap, requested);
      if (lodCap === '2d') {
        failToFallback(true);
        return;
      }
      if (lodCap === 'lite') {
        // Only the costly full-screen effects go. The soft fire, candle and steam sprites are a
        // handful of points and are what keeps the hall from snapping back to the hard baked
        // flames and the vertical steam strands (a jarring regression a few seconds in).
        if (dust) { scene.remove(dust); dust.geometry.dispose(); dust.material.map?.dispose(); dust.material.dispose(); dust = null; }
        if (shaft) { scene.remove(shaft); shaft.geometry.dispose(); shaft.material.dispose(); shaft = null; }
        renderer.shadowMap.enabled = false;
        performanceGovernor = createHomeCastle3DPerformanceGovernor('lite');
        canvas.dataset.homeCastleLod = 'lite';
        resize();
      }
    };
    const animateFire = (timestamp) => {
      fireFrame = null;
      if (disposed || !model || document.hidden) return;
      const degradeTo = performanceGovernor.observe(timestamp);
      if (degradeTo) {
        applyLodCap(degradeTo);
        if (lodCap === '2d') return;
      }
      if (lastFireRafAt !== null) {
        fireRafCount += 1;
        // Ignore the warm-up: decoding the scene legitimately delays the first frames.
        if (fireRafCount > HOME_BLENDER_FIRE_WARMUP_FRAMES) {
          const gap = timestamp - lastFireRafAt;
          fireFrameGapMs = fireFrameGapMs ? fireFrameGapMs * 0.9 + gap * 0.1 : gap;
        }
      }
      lastFireRafAt = timestamp;
      if (timestamp - lastFireRenderedAt >= fireIntervalMs) {
        moveDust(timestamp);
        moveFireParticles(timestamp);
        applyHomeBlenderKlausMotion(klausRig, timestamp);
        if (matthiasActor) {
          const dt = lastActorTickAt === null ? 0 : (timestamp - lastActorTickAt) / 1000;
          lastActorTickAt = timestamp;
          matthiasActor.update(dt);
        }
        const lightFactor = applyRuntimeFireMotion(fireRig, timestamp);
        runtimeLights.leftHearth.intensity = runtimeLights.leftHearthBase * lightFactor.left;
        runtimeLights.rightHearth.intensity = runtimeLights.rightHearthBase * lightFactor.right;
        for (const torch of runtimeLights.torches) {
          torch.light.intensity = torch.base
            * homeBlenderFireMotion({ timeMs: timestamp, phase: torch.phase, kind: 'candle' }).light;
        }
        for (const glow of runtimeLights.glows) {
          glow.sprite.material.opacity = homeBlenderGlowOpacity(
            glow.base,
            glow.light.intensity / (glow.lightBase || 1),
          );
        }
        const startedAt = performance.now();
        renderFrame();
        const cost = performance.now() - startedAt;
        fireRenderCostMs = fireSamples === 0 ? cost : fireRenderCostMs * 0.8 + cost * 0.2;
        fireSamples += 1;
        lastFireRenderedAt = timestamp;
        const plan = homeBlenderFireFramePlan({
          baseIntervalMs: baseFireIntervalMs,
          renderCostMs: fireRenderCostMs,
          frameGapMs: fireFrameGapMs,
          samples: fireSamples,
        });
        fireIntervalMs = plan.intervalMs;
        canvas.dataset.homeFireCostMs = fireRenderCostMs.toFixed(1);
        canvas.dataset.homeFireGapMs = fireFrameGapMs.toFixed(1);
        // The frame planner only throttles. It intentionally never terminates
        // this shared loop, because doing so freezes Matthias and every ambient
        // animation until the Home is remounted.
      }
      fireFrame = window.requestAnimationFrame(animateFire);
    };

    const prefersReducedMotion = getEffectiveReducedMotion();

    const softwareRenderer = homeBlenderIsSoftwareRenderer(readRendererName(renderer));

    const startFireAnimation = () => {
      if (prefersReducedMotion) {
        canvas.dataset.homeFireMotion = 'reduced';
        if (klausRig) canvas.dataset.homeKlausMotion = 'reduced';
        return;
      }
      if (softwareRenderer) {
        canvas.dataset.homeFireMotion = 'off-software';
        if (klausRig) canvas.dataset.homeKlausMotion = 'off-software';
        return;
      }
      if (disposed || !model || document.hidden || fireFrame !== null) return;
      canvas.dataset.homeFireMotion = 'live';
      if (klausRig) canvas.dataset.homeKlausMotion = 'live';
      if (effectsAllowed()) {
        ensureDust();
        ensureMoonShaft();
      }
      ensureFireParticles();
      ensureCandleParticles();
      ensureSteamSprites();
      lastFireRafAt = null;
      fireFrame = window.requestAnimationFrame(animateFire);
    };

    const stopFireAnimation = () => {
      if (fireFrame !== null) window.cancelAnimationFrame(fireFrame);
      fireFrame = null;
    };

    const onVisibilityChange = () => {
      if (document.hidden) stopFireAnimation();
      else startFireAnimation();
    };

    const resize = () => {
      const width = Math.max(1, canvas.clientWidth || canvas.parentElement?.clientWidth || 1);
      const height = Math.max(1, canvas.clientHeight || canvas.parentElement?.clientHeight || 1);
      const policy = browserPolicy(lodCap);
      canvas.dataset.homeCastleLod = policy.lod;
      if (homeBlenderPolicyNeedsFallback(policy)) {
        failToFallback(true);
        return;
      }
      renderer.setPixelRatio(Math.min(policy.pixelRatio || 1, 1.5));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.fov = homeBlenderCameraFovForAspect(camera.aspect);
      canvas.dataset.homeBlenderCamera = camera.aspect < 1 ? 'portrait-wide' : 'canonical';
      camera.updateProjectionMatrix();
      if (onAnchorLayout) {
        const pose = homeBlenderCameraPoseForAspect(camera.aspect);
        camera.position.set(pose.position.x, pose.position.y, pose.position.z);
        camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
        onAnchorLayout(homeBlenderProjectAnchors(camera));
      }
      reportMatthiasLayout();
      requestRender();
    };

    const reportMatthiasLayout = () => {
      const report = matthiasLayoutRef.current;
      if (!report) return;
      if (disposed) return;
      if (fallbackRequested) {
        report(null);
        return;
      }
      // Still loading the rig: stay pending, never fall back to the portrait.
      if (!matthiasActor) return;
      const pose = homeBlenderCameraPoseForAspect(camera.aspect);
      camera.position.set(pose.position.x, pose.position.y, pose.position.z);
      camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
      const rect = homeMatthiasProjectBounds(matthiasActor.bounds(), camera);
      const routine = matthiasActor.routine;
      report(rect ? { ...rect, station: routine.stationId, posture: routine.posture, profile: routine.profile } : null);
    };

    const applyMatthiasRoutine = () => {
      if (!matthiasActor || disposed) return;
      const props = matthiasPropsRef.current || {};
      const routine = homeMatthiasActorRoutine(props);
      const moved = matthiasActor.setRoutine(routine, {
        reducedMotion: prefersReducedMotion || softwareRenderer,
      });
      canvas.dataset.homeMatthiasActor = 'ready';
      canvas.dataset.homeMatthiasStation = routine.stationId;
      canvas.dataset.homeMatthiasPosture = routine.posture;
      canvas.dataset.homeMatthiasClip = routine.clip;
      if (moved && renderer.shadowMap.enabled) renderer.shadowMap.needsUpdate = true;
      reportMatthiasLayout();
      requestRender();
    };
    matthiasApplyRef.current = applyMatthiasRoutine;

    const loadMatthiasActor = () => {
      if (!matthiasPropsRef.current || matthiasActor) return;
      canvas.dataset.homeMatthiasActor = 'loading';
      const actorLoader = new GLTFLoader();
      actorLoader.load(
        `${import.meta.env.BASE_URL}${HOME_MATTHIAS_ACTOR_MODEL_PATH}`,
        (gltf) => {
          if (disposeStaleHomeBlenderGltf(gltf, disposed || fallbackRequested)) return;
          matthiasActor = createHomeMatthiasActor(gltf, { shadowsEnabled: renderer.shadowMap.enabled });
          scene.add(matthiasActor.object);
          applyMatthiasRoutine();
        },
        undefined,
        () => {
          if (disposed) return;
          canvas.dataset.homeMatthiasActor = 'unavailable';
          matthiasLayoutRef.current?.(null);
        },
      );
    };

    const failToFallback = (force = false) => {
      if (disposed || fallbackRequested || (!force && model)) return;
      fallbackRequested = true;
      matthiasLayoutRef.current?.(null);
      canvas.classList.remove('is-ready');
      canvas.dataset.homeBlenderRuntime = 'fallback';
      onUnavailable?.();
    };
    loadTimer = window.setTimeout(() => failToFallback(), 20_000);

    const loader = new GLTFLoader();
    // The runtime scene is published Meshopt-compressed; uncompressed files still load.
    loader.setMeshoptDecoder(MeshoptDecoder);
    void loadHomeCastleR2Scene({
      logicalId: HOME_BLENDER_RUNTIME_LOGICAL_ID,
      loader,
    }).then((root) => {
      if (disposed) {
        disposeRuntimeScene(root);
        return;
      }
      if (!root) {
        failToFallback();
        return;
      }
      if (loadTimer !== null) {
        window.clearTimeout(loadTimer);
        loadTimer = null;
      }
      model = root;
      prepareRuntimeScene(model, initialPolicy.lod === 'full', renderer);
      applyHomeBlenderPieceLift(model);
      applyHomeBlenderMoonVisibility(model, ambient);
      fireRig = prepareRuntimeFireRig(model);
      klausRig = prepareHomeBlenderKlausRig(model);
      canvas.dataset.homeKlausMotion = klausRig ? 'ready' : 'missing';
      scene.add(model);
      resize();
      applyRuntimeFireMotion(fireRig, 0);
      renderer.shadowMap.needsUpdate = true;
      renderFrame();
      canvas.dataset.homeBlenderRuntime = 'ready';
      canvas.classList.add('is-ready');
      startFireAnimation();
      loadMatthiasActor();
    });

    const onContextLost = (event) => {
      event.preventDefault();
      canvas.classList.remove('is-ready');
      canvas.dataset.homeBlenderRuntime = 'recovering';
      stopFireAnimation();
      if (contextRecoveryTimer !== null) window.clearTimeout(contextRecoveryTimer);
      contextRecoveryTimer = window.setTimeout(() => {
        contextRecoveryTimer = null;
        failToFallback(true);
      }, 8_000);
    };
    const onContextRestored = () => {
      if (disposed || fallbackRequested) return;
      if (contextRecoveryTimer !== null) {
        window.clearTimeout(contextRecoveryTimer);
        contextRecoveryTimer = null;
      }
      // A restored WebGL context invalidates renderer-owned GPU resources.
      // Re-run the complete runtime effect so renderer, scene, GLTF resources,
      // PMREM/environment, materials and animations are recreated together.
      setContextGeneration((generation) => generation + 1);
    };
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);
    document.addEventListener('visibilitychange', onVisibilityChange);

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(resize)
      : null;
    resizeObserver?.observe(canvas);
    window.addEventListener('resize', resize, { passive: true });
    resize();

    return () => {
      disposed = true;
      renderRequestRef.current = null;
      if (frame !== null) window.cancelAnimationFrame(frame);
      stopFireAnimation();
      if (loadTimer !== null) window.clearTimeout(loadTimer);
      if (contextRecoveryTimer !== null) window.clearTimeout(contextRecoveryTimer);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      canvas.classList.remove('is-ready');
      matthiasApplyRef.current = null;
      if (matthiasActor) {
        matthiasActor.dispose();
        matthiasActor = null;
      }
      // Unmount or a re-run (ambient change, context restore): back to pending,
      // not to the portrait, so the resident does not flash out of the hall.
      matthiasLayoutRef.current?.(undefined);
      if (model) {
        scene.remove(model);
        disposeRuntimeScene(model);
      }
      for (const points of fireParticles) {
        if (points.userData.candles) {
          scene.remove(points);
          points.geometry.dispose();
          points.material.dispose();
        } else {
          disposeFireSprites(points);
        }
      }
      if (shaft) {
        scene.remove(shaft);
        shaft.geometry.dispose();
        shaft.material.dispose();
      }
      if (dust) {
        scene.remove(dust);
        dust.geometry.dispose();
        dust.material.map?.dispose();
        dust.material.dispose();
      }
      runtimeLights.disposeGlows?.();
      releaseEnvironment();
      renderer.dispose();
    };
  }, [ambient, contextGeneration, onUnavailable]);

  // Routine changes (hourly schedule, greeting) move the resident between
  // stations without reloading the hall or the rig.
  const matthiasScene = matthias?.scene || '';
  const matthiasActivity = matthias?.activity || '';
  const matthiasSpeaking = Boolean(matthias?.speaking);
  useEffect(() => {
    matthiasApplyRef.current?.();
  }, [matthiasScene, matthiasActivity, matthiasSpeaking]);

  // renderer.dispose() libera recursos pero no el contexto WebGL: éste vive
  // hasta que el recolector se lleve el canvas, y cada ida y vuelta Home ⇄
  // partida dejaba uno más (Chrome empieza a perder contextos hacia los 16).
  // Sólo al desmontar: el efecto de arriba se reejecuta sobre el MISMO canvas
  // (ambient, recuperación de contexto) y necesita que el contexto siga vivo.
  // Declarado después, su limpieza corre tras la del efecto de render.
  useEffect(() => () => {
    const loseContext = glLoseContextRef.current;
    glLoseContextRef.current = null;
    glContextRef.current = null;
    releaseHomeBlenderWebglContext(loseContext);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="illustrated-home__castle-3d"
      data-home-castle-lod="loading"
      data-home-castle-compositor="blender-runtime"
      data-home-castle-picked="none"
      data-home-blender-runtime="loading"
      data-home-blender-camera="canonical"
      data-home-klaus-motion="loading"
      aria-hidden="true"
    />
  );
}