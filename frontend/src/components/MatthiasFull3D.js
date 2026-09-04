import * as THREE from 'three';
import {
  applyMatthiasPawnPose,
  createMatthiasPawn3D,
  disposeMatthiasPawn3D,
  MATTHIAS_PAWN_EMBLEM,
  matthiasPawnPoseSample,
} from './MatthiasPawn3D.js';

export const MATTHIAS_FULL3D_MODEL_VERSION = 'matthias-full3d-v1';
export const MATTHIAS_FULL3D_FACE_RIG_VERSION = 'full3d-face-rig-v1';
export const MATTHIAS_FULL3D_FIDELITY_VERSION = 'canonical-front-v1';
export const MATTHIAS_FULL3D_RENDER_CONTRACT = 'full-3d-rig-v1';
export const MATTHIAS_FULL3D_BODY_MOTION_VERSION = 'full3d-body-motion-v1';
export { MATTHIAS_PAWN_EMBLEM, matthiasPawnPoseSample };

const BODY_MOTION_LIMITS = Object.freeze({
  lateral: .030,
  roll: .013,
  pitch: .009,
  chestLift: .006,
});

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function clamp(value, limit) {
  return Math.max(-limit, Math.min(limit, finite(value)));
}

export function matthiasFull3DBodyMotionSample(pose = {}) {
  const bodyYaw = finite(pose.bodyYaw);
  const bodyY = finite(pose.bodyY);
  const headYaw = finite(pose.headYaw);
  const headPitch = finite(pose.headPitch);
  const headRoll = finite(pose.headRoll);

  // The legacy pawn pose already contains the behavioural intent we want:
  // breathing, glance/survey lean and body yaw. Full3D translates those same
  // signals into a tiny physical weight transfer instead of inventing another
  // animation state machine. There is deliberately no Z translation or scale.
  return {
    x: clamp((bodyYaw * 3.2) + (headYaw * .055), BODY_MOTION_LIMITS.lateral),
    roll: clamp((-bodyYaw * .86) + (headRoll * .08), BODY_MOTION_LIMITS.roll),
    pitch: clamp(headPitch * .055, BODY_MOTION_LIMITS.pitch),
    chestLift: clamp(bodyY * .55, BODY_MOTION_LIMITS.chestLift),
  };
}

function addLid(parent, faceMaterial, name, x, y) {
  const lid = new THREE.Mesh(
    new THREE.CapsuleGeometry(.024, .105, 3, 12),
    faceMaterial,
  );
  lid.name = name;
  lid.position.set(x, y, .585);
  lid.rotation.z = Math.PI / 2;
  lid.scale.set(1, .72, .42);
  lid.castShadow = false;
  lid.receiveShadow = false;
  parent.add(lid);
  return lid;
}

function materialForNamedNode(root, name) {
  let material = null;
  root.traverse((node) => {
    if (!material && node.name === name) material = node.material || null;
  });
  return material;
}

export function createMatthiasFull3D({ compact = false } = {}) {
  const rig = createMatthiasPawn3D({ compact });
  rig.root.name = MATTHIAS_FULL3D_MODEL_VERSION;

  // Body + head live under a dedicated posture pivot. The underlying pawn rig
  // keeps owning expression/FSM motion; this pivot only adds restrained whole-
  // body mechanics such as weight transfer and breathing posture.
  const posturePivot = new THREE.Group();
  posturePivot.name = 'full3d-posture-pivot';
  rig.root.add(posturePivot);
  posturePivot.add(rig.body);
  posturePivot.add(rig.headPivot);

  const bodyBaseY = rig.body.position.y;

  // The old pawn model already contains the premium Matthias silhouette and the
  // independent face parts. Full3D v1 keeps that identity but adds actual lids
  // so blinking is occlusion by geometry rather than squashing the eyeballs.
  const faceMaterial = materialForNamedNode(rig.root, 'pawn-face');
  const leftUpperLid = addLid(rig.headPivot, faceMaterial, 'eyelid-left-upper', -.185, .495);
  const rightUpperLid = addLid(rig.headPivot, faceMaterial, 'eyelid-right-upper', .185, .495);
  const leftLowerLid = addLid(rig.headPivot, faceMaterial, 'eyelid-left-lower', -.185, .345);
  const rightLowerLid = addLid(rig.headPivot, faceMaterial, 'eyelid-right-lower', .185, .345);

  rig.full3d = {
    posturePivot,
    bodyBaseY,
    leftUpperLid,
    rightUpperLid,
    leftLowerLid,
    rightLowerLid,
    upperOpenY: .495,
    lowerOpenY: .345,
    upperClosedY: .421,
    lowerClosedY: .407,
  };

  rig.root.userData.modelVersion = MATTHIAS_FULL3D_MODEL_VERSION;
  rig.root.userData.faceRigVersion = MATTHIAS_FULL3D_FACE_RIG_VERSION;
  rig.root.userData.fidelityVersion = MATTHIAS_FULL3D_FIDELITY_VERSION;
  rig.root.userData.renderContract = MATTHIAS_FULL3D_RENDER_CONTRACT;
  rig.root.userData.bodyMotionVersion = MATTHIAS_FULL3D_BODY_MOTION_VERSION;
  rig.root.userData.emblem = MATTHIAS_PAWN_EMBLEM;
  return rig;
}

export function applyMatthiasFull3DPose(rig, pose) {
  if (!rig || !pose) return;
  applyMatthiasPawnPose(rig, pose);

  const full3d = rig.full3d;
  if (full3d?.posturePivot) {
    const bodyMotion = matthiasFull3DBodyMotionSample(pose);
    full3d.posturePivot.position.set(bodyMotion.x, 0, 0);
    full3d.posturePivot.rotation.set(bodyMotion.pitch, 0, bodyMotion.roll);
    full3d.posturePivot.scale.set(1, 1, 1);
    rig.body.position.y = full3d.bodyBaseY + bodyMotion.chestLift;
  }

  // Undo the legacy eye-squash blink. Eyes remain solid 3D geometry and are
  // covered by face-coloured lids, which gives us a real blink in depth.
  rig.leftEye.scale.y = 1.30;
  rig.rightEye.scale.y = 1.30;

  const lids = rig.full3d;
  if (lids) {
    const blink = Math.max(0, Math.min(1, Number(pose.blink) || 0));
    const upperY = THREE.MathUtils.lerp(lids.upperOpenY, lids.upperClosedY, blink);
    const lowerY = THREE.MathUtils.lerp(lids.lowerOpenY, lids.lowerClosedY, blink);
    lids.leftUpperLid.position.y = upperY;
    lids.rightUpperLid.position.y = upperY;
    lids.leftLowerLid.position.y = lowerY;
    lids.rightLowerLid.position.y = lowerY;
  }
}

export function disposeMatthiasFull3D(rig) {
  disposeMatthiasPawn3D(rig);
}
