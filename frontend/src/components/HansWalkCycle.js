import * as THREE from 'three';

export const HANS_WALK_CYCLE_VERSION = 'hans-walk-cycle-v2-full-body-articulated';

const CYCLE_DISTANCE = 0.26;
const DEFAULT_KNEE_FLEX = 0.085;
const SWING_KNEE_FLEX = 0.42;
const CONTACT_KNEE_FLEX = 0.065;
const HORIZONTAL_KNEE_GAIN = 0.42;
const FOOT_COUNTER_ROTATION = 0.64;
const TOE_LIFT = 0.11;
const HUNCH_RADIANS = 0.065;
const HORIZONTAL_HUNCH_BONUS_RADIANS = 0.105;
const BASE_ARM_SWING_GAIN = 1.25;
const HORIZONTAL_ARM_SWING_BONUS = 2.35;
const HORIZONTAL_LEG_SWING_BONUS = 0.55;
const HORIZONTAL_STEP_BONUS = 0.5;
const HORIZONTAL_LIFT_BONUS = 0.4;

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
  target.leg = swing * 0.17;
  target.step = swing * 0.058;
  target.leftLift = leftSwing * 0.034;
  target.rightLift = rightSwing * 0.034;
  target.bob = -Math.abs(Math.sin(phase * 2)) * 0.012;
  target.sway = Math.cos(phase) * 0.011;
  target.roll = Math.cos(phase) * 0.009;
  target.yaw = swing * 0.008;
  target.arm = swing * 0.045;
  target.nod = Math.abs(Math.sin(phase * 2)) * 0.012;
  return target;
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
  };
}

function applyAccessoryGait(body, bases, sample, forward, carrying) {
  if (body?.cane && bases.cane) {
    body.cane.visible = !carrying;
    if (!carrying) {
      body.cane.position.set(bases.cane.x, bases.cane.y + Math.max(0, sample.bob + 0.012) * 0.5, bases.cane.z);
      body.cane.rotation.x = bases.cane.rx - forward * sample.arm * 1.35;
      body.cane.rotation.y = bases.cane.ry;
      body.cane.rotation.z = bases.cane.rz - sample.sway * 1.15;
    }
  }

  if (body?.tailcoat && bases.tailcoat) {
    body.tailcoat.position.set(bases.tailcoat.x, bases.tailcoat.y, bases.tailcoat.z);
    body.tailcoat.rotation.x = bases.tailcoat.rx - forward * sample.bob * 0.85;
    body.tailcoat.rotation.y = bases.tailcoat.ry - sample.yaw * 0.55;
    body.tailcoat.rotation.z = bases.tailcoat.rz - sample.roll * 0.28;
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
  const horizontal = clamp01(horizontalWeight);
  const forward = controller.forward;
  const kneeGain = 1 + horizontal * HORIZONTAL_KNEE_GAIN;
  const legSwingGain = 1 + horizontal * HORIZONTAL_LEG_SWING_BONUS;
  const stepGain = 1 + horizontal * HORIZONTAL_STEP_BONUS;
  const liftGain = 1 + horizontal * HORIZONTAL_LIFT_BONUS;
  const activeHunch = HUNCH_RADIANS + HORIZONTAL_HUNCH_BONUS_RADIANS * horizontal;
  const armSwingGain = BASE_ARM_SWING_GAIN + HORIZONTAL_ARM_SWING_BONUS * horizontal;
  const silhouetteShift = activeHunch * horizontal;
  const leftFlex = sample.leftKnee * kneeGain;
  const rightFlex = sample.rightKnee * kneeGain;

  if (body.leftLeg && bases.leftLeg) {
    body.leftLeg.position.set(
      bases.leftLeg.x,
      bases.leftLeg.y + sample.leftLift * liftGain,
      bases.leftLeg.z + forward * sample.step * stepGain,
    );
    body.leftLeg.rotation.set(
      bases.leftLeg.rx + sample.leg * legSwingGain,
      bases.leftLeg.ry,
      bases.leftLeg.rz - sample.sway * 0.72,
    );
  }
  if (body.rightLeg && bases.rightLeg) {
    body.rightLeg.position.set(
      bases.rightLeg.x,
      bases.rightLeg.y + sample.rightLift * liftGain,
      bases.rightLeg.z - forward * sample.step * stepGain,
    );
    body.rightLeg.rotation.set(
      bases.rightLeg.rx - sample.leg * legSwingGain,
      bases.rightLeg.ry,
      bases.rightLeg.rz - sample.sway * 0.72,
    );
  }

  if (body.leftKnee && bases.leftKnee) {
    body.leftKnee.rotation.set(bases.leftKnee.rx + forward * leftFlex, bases.leftKnee.ry, bases.leftKnee.rz);
  }
  if (body.rightKnee && bases.rightKnee) {
    body.rightKnee.rotation.set(bases.rightKnee.rx + forward * rightFlex, bases.rightKnee.ry, bases.rightKnee.rz);
  }
  if (body.leftShoe && bases.leftShoe) {
    body.leftShoe.rotation.set(
      bases.leftShoe.rx + forward * (-leftFlex * FOOT_COUNTER_ROTATION + sample.leftToe),
      bases.leftShoe.ry,
      bases.leftShoe.rz,
    );
  }
  if (body.rightShoe && bases.rightShoe) {
    body.rightShoe.rotation.set(
      bases.rightShoe.rx + forward * (-rightFlex * FOOT_COUNTER_ROTATION + sample.rightToe),
      bases.rightShoe.ry,
      bases.rightShoe.rz,
    );
  }

  if (body.torso && bases.torso) {
    body.torso.position.set(
      bases.torso.x + sample.sway,
      bases.torso.y + sample.bob,
      bases.torso.z + forward * silhouetteShift * 0.42,
    );
    body.torso.rotation.set(
      bases.torso.rx + forward * (activeHunch + Math.abs(sample.bob) * 0.35),
      bases.torso.ry + sample.yaw,
      bases.torso.rz + sample.roll,
    );
  }
  if (body.head && bases.head) {
    body.head.position.set(
      bases.head.x + sample.sway * 0.38,
      bases.head.y + sample.bob * 0.42,
      bases.head.z + forward * silhouetteShift * 0.62,
    );
    body.head.rotation.set(
      bases.head.rx + forward * (HUNCH_RADIANS * 0.28 + HORIZONTAL_HUNCH_BONUS_RADIANS * horizontal * 0.1 + sample.nod),
      bases.head.ry - sample.yaw * 0.7,
      bases.head.rz - sample.roll * 0.45,
    );
  }

  const carryingLog = body?.carriedLog?.visible === true;
  const carryingPoker = body?.carriedPoker?.visible === true;
  const carrying = carryingLog || carryingPoker;
  if (carryingLog) {
    if (body?.leftArm && bases.leftArm) {
      body.leftArm.position.z = bases.leftArm.z + forward * silhouetteShift * 0.48;
      body.leftArm.rotation.x = bases.leftArm.rx - 0.43;
      body.leftArm.rotation.z = bases.leftArm.rz + 0.035;
    }
    if (body?.rightArm && bases.rightArm) {
      body.rightArm.position.z = bases.rightArm.z + forward * silhouetteShift * 0.48;
      body.rightArm.rotation.x = bases.rightArm.rx - 0.5;
      body.rightArm.rotation.z = bases.rightArm.rz - 0.025;
    }
  } else if (carryingPoker) {
    if (body?.leftArm && bases.leftArm) {
      body.leftArm.position.z = bases.leftArm.z + forward * silhouetteShift * 0.48;
      body.leftArm.rotation.x = bases.leftArm.rx - 0.12;
    }
    if (body?.rightArm && bases.rightArm) {
      body.rightArm.position.z = bases.rightArm.z + forward * silhouetteShift * 0.48;
      body.rightArm.rotation.x = bases.rightArm.rx - 0.42;
    }
  } else {
    if (body?.leftArm && bases.leftArm) {
      body.leftArm.position.z = bases.leftArm.z + forward * silhouetteShift * 0.48;
      body.leftArm.rotation.x = bases.leftArm.rx - sample.arm * armSwingGain;
      body.leftArm.rotation.z = bases.leftArm.rz + 0.018 * horizontal;
    }
    if (body?.rightArm && bases.rightArm) {
      body.rightArm.position.z = bases.rightArm.z + forward * silhouetteShift * 0.48;
      body.rightArm.rotation.x = bases.rightArm.rx + sample.arm * armSwingGain * 0.72;
      body.rightArm.rotation.z = bases.rightArm.rz - 0.014 * horizontal;
    }
  }

  applyAccessoryGait(body, bases, sample, forward, carrying);
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

export function resetHansWalkCycle(controller, { full = false } = {}) {
  if (!controller?.body) return;
  const { body, bases } = controller;
  restorePart(body.leftKnee, bases.leftKnee);
  restorePart(body.rightKnee, bases.rightKnee);
  restorePart(body.leftShoe, bases.leftShoe);
  restorePart(body.rightShoe, bases.rightShoe);
  if (!full) return;
  restorePart(body.leftLeg, bases.leftLeg);
  restorePart(body.rightLeg, bases.rightLeg);
  restorePart(body.torso, bases.torso);
  restorePart(body.head, bases.head);
  restorePart(body.leftArm, bases.leftArm);
  restorePart(body.rightArm, bases.rightArm);
  restorePart(body.cane, bases.cane);
  restorePart(body.tailcoat, bases.tailcoat);
}
