import * as THREE from 'three';

export const HANS_WALK_CYCLE_VERSION = 'hans-walk-cycle-v1-articulated-knees';

const CYCLE_DISTANCE = 0.26;
const DEFAULT_KNEE_FLEX = 0.085;
const SWING_KNEE_FLEX = 0.42;
const CONTACT_KNEE_FLEX = 0.065;
const HORIZONTAL_KNEE_GAIN = 0.42;
const FOOT_COUNTER_ROTATION = 0.64;
const TOE_LIFT = 0.11;

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
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
    body[shinKey] = body?.[shinKey] || existingKnee.getObjectByName?.(`war-room-hans-${side}-shin`) || null;
    body[shoeKey] = body?.[shoeKey] || existingKnee.getObjectByName?.(`war-room-hans-${side}-shoe`) || null;
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
  const upperLength = height * 0.48;
  const lowerLength = height - upperLength;
  const topY = rigidLeg.position.y + height * 0.5;
  const kneeY = topY - upperLength;
  const originalShoePosition = shoe.position.clone();
  const originalShoeRotation = shoe.rotation.clone();
  const material = rigidLeg.material;

  leg.remove(rigidLeg);
  leg.remove(shoe);
  rigidLeg.geometry?.dispose?.();

  const upper = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, midRadius, upperLength, radialSegments),
    material,
  );
  upper.name = `war-room-hans-${side}-thigh`;
  upper.position.y = topY - upperLength * 0.5;
  copyMeshFlags(rigidLeg, upper);
  leg.add(upper);

  const knee = new THREE.Group();
  knee.name = `war-room-hans-${side}-knee`;
  knee.position.y = kneeY;
  leg.add(knee);

  const joint = new THREE.Mesh(
    new THREE.SphereGeometry(midRadius * 1.03, 9, 7),
    material,
  );
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

  shoe.position.set(
    originalShoePosition.x,
    originalShoePosition.y - kneeY,
    originalShoePosition.z,
  );
  shoe.rotation.copy(originalShoeRotation);
  shoe.name = `war-room-hans-${side}-shoe`;
  knee.add(shoe);

  leg.userData.hansLegArticulation = HANS_WALK_CYCLE_VERSION;
  knee.userData.hansKneePivot = HANS_WALK_CYCLE_VERSION;
  body[kneeKey] = knee;
  body[shinKey] = shin;
  body[shoeKey] = shoe;
  body[`${side}Thigh`] = upper;
  return knee;
}

export function ensureHansArticulatedLegs(body) {
  if (!body?.leftLeg || !body?.rightLeg) return false;
  const left = articulateLeg(body, 'left');
  const right = articulateLeg(body, 'right');
  return Boolean(left && right);
}

function captureRotation(part) {
  if (!part?.rotation) return null;
  return {
    x: part.rotation.x,
    y: part.rotation.y,
    z: part.rotation.z,
  };
}

function restoreRotation(part, base) {
  if (!part || !base) return;
  part.rotation.set(base.x, base.y, base.z);
}

export function sampleHansWalkCycle(distance, target = {}) {
  const phase = (((Number(distance) || 0) / CYCLE_DISTANCE) % 1 + 1) % 1 * Math.PI * 2;
  const swing = Math.sin(phase);
  const contact = Math.cos(phase);
  const leftSwing = Math.max(0, swing);
  const rightSwing = Math.max(0, -swing);
  const leftContact = Math.max(0, -contact);
  const rightContact = Math.max(0, contact);

  target.phase = phase;
  target.leftKnee = DEFAULT_KNEE_FLEX + leftSwing * SWING_KNEE_FLEX + leftContact * CONTACT_KNEE_FLEX;
  target.rightKnee = DEFAULT_KNEE_FLEX + rightSwing * SWING_KNEE_FLEX + rightContact * CONTACT_KNEE_FLEX;
  target.leftToe = leftSwing * TOE_LIFT;
  target.rightToe = rightSwing * TOE_LIFT;
  target.bob = -Math.abs(Math.sin(phase * 2)) * 0.006;
  return target;
}

export function createHansWalkCycle(body, { forward = 1 } = {}) {
  if (!ensureHansArticulatedLegs(body)) return null;
  const controller = {
    version: HANS_WALK_CYCLE_VERSION,
    body,
    forward: Math.sign(Number(forward) || 1) || 1,
    distance: 0,
    sample: {},
    bases: {
      leftKnee: captureRotation(body.leftKnee),
      rightKnee: captureRotation(body.rightKnee),
      leftShoe: captureRotation(body.leftShoe),
      rightShoe: captureRotation(body.rightShoe),
    },
  };
  return controller;
}

export function applyHansWalkCycle(controller, {
  distance = controller?.distance || 0,
  horizontalWeight = 0,
} = {}) {
  if (!controller?.body) return null;
  const body = controller.body;
  const sample = sampleHansWalkCycle(distance, controller.sample);
  const horizontal = clamp01(horizontalWeight);
  const kneeGain = 1 + horizontal * HORIZONTAL_KNEE_GAIN;
  const forward = controller.forward;

  const leftFlex = sample.leftKnee * kneeGain;
  const rightFlex = sample.rightKnee * kneeGain;

  if (body.leftKnee && controller.bases.leftKnee) {
    body.leftKnee.rotation.x = controller.bases.leftKnee.x + forward * leftFlex;
  }
  if (body.rightKnee && controller.bases.rightKnee) {
    body.rightKnee.rotation.x = controller.bases.rightKnee.x + forward * rightFlex;
  }
  if (body.leftShoe && controller.bases.leftShoe) {
    body.leftShoe.rotation.x = controller.bases.leftShoe.x
      + forward * (-leftFlex * FOOT_COUNTER_ROTATION + sample.leftToe);
  }
  if (body.rightShoe && controller.bases.rightShoe) {
    body.rightShoe.rotation.x = controller.bases.rightShoe.x
      + forward * (-rightFlex * FOOT_COUNTER_ROTATION + sample.rightToe);
  }

  controller.distance = Number(distance) || 0;
  return sample;
}

export function advanceHansWalkCycle(controller, {
  travelled = 0,
  horizontalWeight = 0,
} = {}) {
  if (!controller) return null;
  controller.distance += Math.max(0, Number(travelled) || 0);
  return applyHansWalkCycle(controller, {
    distance: controller.distance,
    horizontalWeight,
  });
}

export function resetHansWalkCycle(controller) {
  if (!controller?.body) return;
  restoreRotation(controller.body.leftKnee, controller.bases.leftKnee);
  restoreRotation(controller.body.rightKnee, controller.bases.rightKnee);
  restoreRotation(controller.body.leftShoe, controller.bases.leftShoe);
  restoreRotation(controller.body.rightShoe, controller.bases.rightShoe);
}
