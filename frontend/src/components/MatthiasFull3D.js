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
export { MATTHIAS_PAWN_EMBLEM, matthiasPawnPoseSample };

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

  // The old pawn model already contains the premium Matthias silhouette and the
  // independent face parts. Full3D v1 keeps that identity but adds actual lids
  // so blinking is occlusion by geometry rather than squashing the eyeballs.
  const faceMaterial = materialForNamedNode(rig.root, 'pawn-face');
  const leftUpperLid = addLid(rig.headPivot, faceMaterial, 'eyelid-left-upper', -.185, .495);
  const rightUpperLid = addLid(rig.headPivot, faceMaterial, 'eyelid-right-upper', .185, .495);
  const leftLowerLid = addLid(rig.headPivot, faceMaterial, 'eyelid-left-lower', -.185, .345);
  const rightLowerLid = addLid(rig.headPivot, faceMaterial, 'eyelid-right-lower', .185, .345);

  rig.full3d = {
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
  rig.root.userData.emblem = MATTHIAS_PAWN_EMBLEM;
  return rig;
}

export function applyMatthiasFull3DPose(rig, pose) {
  if (!rig || !pose) return;
  applyMatthiasPawnPose(rig, pose);

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
