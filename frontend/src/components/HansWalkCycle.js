import * as THREE from 'three';

export const HANS_WALK_CYCLE_VERSION = 'hans-walk-cycle-v5-foot-target-ik';

const CYCLE_DISTANCE = 0.26;
const STANCE_SHARE = 0.62;
const STRIDE_LENGTH = 0.11;
const FOOT_CLEARANCE = 0.025;
const STANCE_COMPRESSION = 0.012;
const MIN_KNEE_FLEX = 0.04;
const MAX_KNEE_FLEX = 0.72;
const HEEL_STRIKE_TOE_UP = 0.08;
const TOE_OFF_TOE_UP = -0.11;
const SWING_TOE_UP = 0.055;
const HUNCH_RADIANS = 0.065;
const BASE_ARM_SWING_GAIN = 1.25;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

function smooth01(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function mod1(value) {
  const n = Number(value) || 0;
  return ((n % 1) + 1) % 1;
}

function findLongCylinder(leg) {
  return leg?.children?.find((child) => (
    child?.isMesh
    && child.geometry?.type === 'CylinderGeometry'
    && Number(child.geometry?.parameters?.height || 0) > 0.5
  )) || null;
}

function findShoe(leg) {
  return leg?.children?.find((child) => {
    if (!child?.isMesh || child.geometry?.type !== 'BoxGeometry') return false;
    const params = child.geometry?.parameters || {};
    const depth = Number(params.depth || 0);
    const width = Number(params.width || 0);
    const height = Number(params.height || 0);
    return depth > width * 1.25 && depth > height * 1.8;
  }) || null;
}

function copyMeshFlags(source, target) {
  target.castShadow = source?.castShadow ?? true;
  target.receiveShadow = source?.receiveShadow ?? true;
}

function ensureAnkle(body, side, knee, shoe, lowerLength) {
  const ankleKey = `${side}Ankle`;
  const existing = body?.[ankleKey] || knee?.getObjectByName?.(`war-room-hans-${side}-ankle`);
  if (existing) {
    body[ankleKey] = existing;
    body[`${side}Shoe`] = body?.[`${side}Shoe`] || existing.getObjectByName?.(`war-room-hans-${side}-shoe`) || shoe || null;
    return existing;
  }
  if (!knee || !shoe) return null;

  const oldPosition = shoe.position.clone();
  const oldRotation = shoe.rotation.clone();
  knee.remove(shoe);

  const ankle = new THREE.Group();
  ankle.name = `war-room-hans-${side}-ankle`;
  ankle.position.y = -lowerLength;
  knee.add(ankle);

  shoe.position.set(oldPosition.x, oldPosition.y + lowerLength, oldPosition.z);
  shoe.rotation.copy(oldRotation);
  shoe.name = `war-room-hans-${side}-shoe`;
  ankle.add(shoe);

  body[ankleKey] = ankle;
  body[`${side}Shoe`] = shoe;
  return ankle;
}

function articulateLeg(body, side) {
  const legKey = `${side}Leg`;
  const kneeKey = `${side}Knee`;
  const shinKey = `${side}Shin`;
  const shoeKey = `${side}Shoe`;
  const leg = body?.[legKey];
  if (!leg) return null;

  const existingKnee = body?.[kneeKey] || leg.getObjectByName?.(`war-room-hans-${side}-knee`);
  if (existingKnee) {
    body[kneeKey] = existingKnee;
    const existingShin = body?.[shinKey] || existingKnee.getObjectByName?.(`war-room-hans-${side}-shin`) || null;
    const existingShoe = body?.[shoeKey]
      || existingKnee.getObjectByName?.(`war-room-hans-${side}-shoe`)
      || existingKnee.getObjectByName?.(`war-room-hans-${side}-ankle`)?.getObjectByName?.(`war-room-hans-${side}-shoe`)
      || null;
    body[shinKey] = existingShin;
    body[shoeKey] = existingShoe;
    const lowerLength = Number(existingShin?.geometry?.parameters?.height || Math.abs(existingShoe?.position?.y || 0.37));
    ensureAnkle(body, side, existingKnee, existingShoe, lowerLength);
    return existingKnee;
  }

  const rigidLeg = findLongCylinder(leg);
  const shoe = body?.[shoeKey] || findShoe(leg);
  if (!rigidLeg || !shoe) return null;

  const params = rigidLeg.geometry?.parameters || {};
  const height = Number(params.height || 0.72);
  const radiusTop = Number(params.radiusTop || 0.095);
  const radiusBottom = Number(params.radiusBottom || 0.085);
  const radialSegments = Math.max(6, Number(params.radialSegments || 9));
  const midRadius = (radiusTop + radiusBottom) * 0.5;
  const upperGeometryLength = height * 0.48;
  const lowerLength = height - upperGeometryLength;
  const topY = rigidLeg.position.y + height * 0.5;
  const kneeY = topY - upperGeometryLength;
  const originalShoePosition = shoe.position.clone();
  const originalShoeRotation = shoe.rotation.clone();
  const material = rigidLeg.material;

  leg.remove(rigidLeg);
  leg.remove(shoe);
  rigidLeg.geometry?.dispose?.();

  const upper = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, midRadius, upperGeometryLength, radialSegments),
    material,
  );
  upper.name = `war-room-hans-${side}-thigh`;
  upper.position.y = topY - upperGeometryLength * 0.5;
  copyMeshFlags(rigidLeg, upper);
  leg.add(upper);

  const knee = new THREE.Group();
  knee.name = `war-room-hans-${side}-knee`;
  knee.position.y = kneeY;
  leg.add(knee);

  const joint = new THREE.Mesh(new THREE.SphereGeometry(midRadius * 1.03, 9, 7), material);
  joint.name = `war-room-hans-${side}-knee-joint`;
  copyMeshFlags(rigidLeg, joint);
  knee.add(joint);

  const shin = new THREE.Mesh(
    new THREE.CylinderGeometry(midRadius, radiusBottom, lowerLength, radialSegments),
    material,
  );
  shin.name = `war-room-hans-${side}-shin`;
  shin.position.y = -lowerLength * 0.5;
  copyMeshFlags(rigidLeg, shin);
  knee.add(shin);

  const ankle = new THREE.Group();
  ankle.name = `war-room-hans-${side}-ankle`;
  ankle.position.y = -lowerLength;
  knee.add(ankle);

  shoe.position.set(
    originalShoePosition.x,
    originalShoePosition.y - (kneeY - lowerLength),
    originalShoePosition.z,
  );
  shoe.rotation.copy(originalShoeRotation);
  shoe.name = `war-room-hans-${side}-shoe`;
  ankle.add(shoe);

  leg.userData.hansLegArticulation = HANS_WALK_CYCLE_VERSION;
  knee.userData.hansKneePivot = HANS_WALK_CYCLE_VERSION;
  ankle.userData.hansAnklePivot = HANS_WALK_CYCLE_VERSION;
  body[kneeKey] = knee;
  body[shinKey] = shin;
  body[shoeKey] = shoe;
  body[`${side}Ankle`] = ankle;
  body[`${side}Thigh`] = upper;
  return knee;
}

export function ensureHansArticulatedLegs(body) {
  if (!body?.leftLeg || !body?.rightLeg) return false;
  return Boolean(articulateLeg(body, 'left') && articulateLeg(body, 'right'));
}

function capturePart(part) {
  if (!part?.position || !part?.rotation) return null;
  return {
    x: part.position.x,
    y: part.position.y,
    z: part.position.z,
    rx: part.rotation.x,
    ry: part.rotation.y,
    rz: part.rotation.z,
  };
}

function restorePart(part, base) {
  if (!part || !base) return;
  part.position.set(base.x, base.y, base.z);
  part.rotation.set(base.rx, base.ry, base.rz);
}

function captureBases(body) {
  return {
    leftLeg: capturePart(body?.leftLeg),
    rightLeg: capturePart(body?.rightLeg),
    leftKnee: capturePart(body?.leftKnee),
    rightKnee: capturePart(body?.rightKnee),
    leftAnkle: capturePart(body?.leftAnkle),
    rightAnkle: capturePart(body?.rightAnkle),
    leftShoe: capturePart(body?.leftShoe),
    rightShoe: capturePart(body?.rightShoe),
    torso: capturePart(body?.torso),
    head: capturePart(body?.head),
    leftArm: capturePart(body?.leftArm),
    rightArm: capturePart(body?.rightArm),
    cane: capturePart(body?.cane),
    tailcoat: capturePart(body?.tailcoat),
  };
}

function sampleFoot(phase) {
  const t = mod1(phase);
  if (t < STANCE_SHARE) {
    const u = t / STANCE_SHARE;
    const forward = STRIDE_LENGTH * (0.5 - u);
    const heelStrike = u < 0.22 ? (1 - smooth01(u / 0.22)) * HEEL_STRIKE_TOE_UP : 0;
    const toeOff = u > 0.72 ? smooth01((u - 0.72) / 0.28) * TOE_OFF_TOE_UP : 0;
    return { forward, lift: 0, toeUp: heelStrike + toeOff, airborne: 0 };
  }

  const u = (t - STANCE_SHARE) / (1 - STANCE_SHARE);
  const travel = smooth01(u);
  return {
    forward: STRIDE_LENGTH * (-0.5 + travel),
    lift: Math.sin(Math.PI * u) * FOOT_CLEARANCE,
    toeUp: Math.sin(Math.PI * u) * SWING_TOE_UP,
    airborne: Math.sin(Math.PI * u),
  };
}

export function sampleHansWalkCycle(distance, target = {}) {
  const cycle = mod1((Number(distance) || 0) / CYCLE_DISTANCE);
  const left = sampleFoot(cycle);
  const right = sampleFoot(cycle + 0.5);
  target.phase = cycle * Math.PI * 2;
  target.leftFootForward = left.forward;
  target.rightFootForward = right.forward;
  target.leftLift = left.lift;
  target.rightLift = right.lift;
  target.leftToe = left.toeUp;
  target.rightToe = right.toeUp;
  target.leftAirborne = left.airborne;
  target.rightAirborne = right.airborne;
  target.step = (left.forward - right.forward) * 0.5;
  target.leg = target.step * 2.4;
  target.bob = -Math.abs(Math.sin(target.phase * 2)) * 0.006;
  target.sway = Math.cos(target.phase) * 0.007;
  target.roll = Math.cos(target.phase) * 0.006;
  target.yaw = Math.sin(target.phase) * 0.006;
  target.arm = Math.sin(target.phase) * 0.04;
  target.nod = Math.abs(Math.sin(target.phase * 2)) * 0.008;
  return target;
}

function solveLeg(upperLength, lowerLength, forwardTarget, lift) {
  const down = Math.max(0.001, upperLength + lowerLength - STANCE_COMPRESSION - Math.max(0, lift));
  const z = Number(forwardTarget) || 0;
  const rawDistance = Math.hypot(z, down);
  const minReach = Math.abs(upperLength - lowerLength) + 0.0001;
  const maxReach = upperLength + lowerLength - 0.0001;
  const reach = clamp(rawDistance, minReach, maxReach);
  const targetAngle = Math.atan2(z, down);
  const hipTriangle = Math.acos(clamp(
    (upperLength * upperLength + reach * reach - lowerLength * lowerLength) / (2 * upperLength * reach),
    -1,
    1,
  ));
  const kneeInterior = Math.acos(clamp(
    (upperLength * upperLength + lowerLength * lowerLength - reach * reach) / (2 * upperLength * lowerLength),
    -1,
    1,
  ));
  const kneeFlex = clamp(Math.PI - kneeInterior, MIN_KNEE_FLEX, MAX_KNEE_FLEX);
  return { hip: targetAngle + hipTriangle, knee: kneeFlex, down, reach };
}

function legLengths(body, side) {
  const knee = body?.[`${side}Knee`];
  const ankle = body?.[`${side}Ankle`];
  const upper = Math.max(0.001, Math.abs(Number(knee?.position?.y || 0.33)));
  const lower = Math.max(0.001, Math.abs(Number(ankle?.position?.y || 0.37)));
  return { upper, lower };
}

export function createHansWalkCycle(body, { forward = 1 } = {}) {
  if (!ensureHansArticulatedLegs(body)) return null;
  return {
    version: HANS_WALK_CYCLE_VERSION,
    body,
    forward: Math.sign(Number(forward) || 1) || 1,
    distance: 0,
    sample: {},
    bases: captureBases(body),
    lengths: {
      left: legLengths(body, 'left'),
      right: legLengths(body, 'right'),
    },
  };
}

function applyLeg(body, bases, lengths, sample, side, forward) {
  const leg = body?.[`${side}Leg`];
  const knee = body?.[`${side}Knee`];
  const ankle = body?.[`${side}Ankle`];
  const legBase = bases?.[`${side}Leg`];
  const kneeBase = bases?.[`${side}Knee`];
  const ankleBase = bases?.[`${side}Ankle`];
  if (!leg || !knee || !ankle || !legBase || !kneeBase || !ankleBase) return null;

  const footForward = sample[`${side}FootForward`];
  const lift = sample[`${side}Lift`];
  const toeUp = sample[`${side}Toe`];
  const solution = solveLeg(lengths.upper, lengths.lower, footForward, lift);
  const hipDelta = -forward * solution.hip;
  const kneeDelta = forward * solution.knee;
  const desiredFootPitch = -forward * toeUp;
  const ankleDelta = desiredFootPitch - hipDelta - kneeDelta;

  leg.rotation.set(legBase.rx + hipDelta, legBase.ry, legBase.rz - sample.sway * 0.45);
  knee.rotation.set(kneeBase.rx + kneeDelta, kneeBase.ry, kneeBase.rz);
  ankle.rotation.set(ankleBase.rx + ankleDelta, ankleBase.ry, ankleBase.rz);

  return {
    kneeFlex: solution.knee,
    hipPitch: hipDelta,
    anklePitch: ankleDelta,
    footPitch: desiredFootPitch,
    lift,
    forward: footForward,
  };
}

function applyAccessoryGait(body, bases, sample, forward, carrying) {
  if (body?.cane && bases.cane) {
    body.cane.visible = !carrying;
    if (!carrying) body.cane.rotation.x = bases.cane.rx - forward * sample.arm * 1.15;
  }
  if (body?.tailcoat && bases.tailcoat) {
    body.tailcoat.rotation.x = bases.tailcoat.rx - forward * sample.bob * 0.6;
    body.tailcoat.rotation.y = bases.tailcoat.ry - sample.yaw * 0.45;
    body.tailcoat.rotation.z = bases.tailcoat.rz - sample.roll * 0.2;
  }
}

export function applyHansWalkCycle(controller, {
  distance = controller?.distance || 0,
  horizontalWeight = 0,
} = {}) {
  if (!controller?.body) return null;
  const body = controller.body;
  const bases = controller.bases;
  const sample = sampleHansWalkCycle(distance, controller.sample);
  const forward = controller.forward;
  const left = applyLeg(body, bases, controller.lengths.left, sample, 'left', forward);
  const right = applyLeg(body, bases, controller.lengths.right, sample, 'right', forward);
  sample.leftKnee = left?.kneeFlex || 0;
  sample.rightKnee = right?.kneeFlex || 0;
  sample.leftFootPitch = left?.footPitch || 0;
  sample.rightFootPitch = right?.footPitch || 0;

  if (body.torso && bases.torso) {
    body.torso.position.set(bases.torso.x + sample.sway, bases.torso.y + sample.bob, bases.torso.z);
    body.torso.rotation.set(
      bases.torso.rx + forward * (HUNCH_RADIANS + Math.abs(sample.bob) * 0.25),
      bases.torso.ry + sample.yaw,
      bases.torso.rz + sample.roll,
    );
  }
  if (body.head && bases.head) {
    body.head.position.set(bases.head.x + sample.sway * 0.3, bases.head.y + sample.bob * 0.35, bases.head.z);
    body.head.rotation.set(
      bases.head.rx + forward * (HUNCH_RADIANS * 0.25 + sample.nod),
      bases.head.ry - sample.yaw * 0.6,
      bases.head.rz - sample.roll * 0.4,
    );
  }

  const carrying = body?.carriedLog?.visible === true || body?.carriedPoker?.visible === true;
  if (!carrying) {
    if (body?.leftArm && bases.leftArm) body.leftArm.rotation.x = bases.leftArm.rx - sample.arm * BASE_ARM_SWING_GAIN;
    if (body?.rightArm && bases.rightArm) body.rightArm.rotation.x = bases.rightArm.rx + sample.arm * BASE_ARM_SWING_GAIN * 0.72;
  }

  applyAccessoryGait(body, bases, sample, forward, carrying);
  controller.distance = Number(distance) || 0;
  controller.lastSolution = { left, right };
  return sample;
}

export function advanceHansWalkCycle(controller, {
  travelled = 0,
  horizontalWeight = 0,
} = {}) {
  if (!controller) return null;
  controller.distance += Math.max(0, Number(travelled) || 0);
  return applyHansWalkCycle(controller, { distance: controller.distance, horizontalWeight });
}

export function resetHansWalkCycle(controller, { full = false } = {}) {
  if (!controller?.body) return;
  const { body, bases } = controller;
  restorePart(body.leftKnee, bases.leftKnee);
  restorePart(body.rightKnee, bases.rightKnee);
  restorePart(body.leftAnkle, bases.leftAnkle);
  restorePart(body.rightAnkle, bases.rightAnkle);
  if (!full) {
    restorePart(body.leftLeg, bases.leftLeg);
    restorePart(body.rightLeg, bases.rightLeg);
    return;
  }
  restorePart(body.leftShoe, bases.leftShoe);
  restorePart(body.rightShoe, bases.rightShoe);
  restorePart(body.leftLeg, bases.leftLeg);
  restorePart(body.rightLeg, bases.rightLeg);
  restorePart(body.torso, bases.torso);
  restorePart(body.head, bases.head);
  restorePart(body.leftArm, bases.leftArm);
  restorePart(body.rightArm, bases.rightArm);
  restorePart(body.cane, bases.cane);
  restorePart(body.tailcoat, bases.tailcoat);
}
