import {
  applyMatthiasPawnPose,
  createMatthiasPawn3D,
  disposeMatthiasPawn3D,
  MATTHIAS_PAWN_EMBLEM,
} from './MatthiasPawn3D.js';

export const MATTHIAS_PREMIUM_HOME_MODEL_VERSION = 'matthias-home-premium-3d-v1';
export const MATTHIAS_PREMIUM_HOME_FACE_RIG_VERSION = 'premium-pawn-face-v1';
export const MATTHIAS_PREMIUM_HOME_FIDELITY_VERSION = 'approved-original-premium-v1';
export const MATTHIAS_PREMIUM_HOME_RENDER_CONTRACT = 'canonical-pawn-3d-v1';
export const MATTHIAS_PREMIUM_HOME_REFERENCE = 'approved-original-matthias-premium-v1';
export { MATTHIAS_PAWN_EMBLEM };

function node(root, name) {
  return root?.getObjectByName?.(name) || null;
}

function setMaterial(nodeRef, {
  color,
  roughness,
  metalness,
  clearcoat,
} = {}) {
  const material = nodeRef?.material;
  if (!material) return;
  if (color != null && material.color?.setHex) material.color.setHex(color);
  if (roughness != null && 'roughness' in material) material.roughness = roughness;
  if (metalness != null && 'metalness' in material) material.metalness = metalness;
  if (clearcoat != null && 'clearcoat' in material) material.clearcoat = clearcoat;
  material.needsUpdate = true;
}

function refreshBase(rig) {
  rig.base.leftEyeX = rig.leftEye.position.x;
  rig.base.rightEyeX = rig.rightEye.position.x;
  rig.base.leftBrowY = rig.leftBrow.position.y;
  rig.base.rightBrowY = rig.rightBrow.position.y;
  rig.base.leftBrowRz = rig.leftBrow.rotation.z;
  rig.base.rightBrowRz = rig.rightBrow.rotation.z;
  rig.base.mouthY = rig.mouthGroup.position.y;
}

export function createMatthiasPremiumHome3D({ compact = false } = {}) {
  const rig = createMatthiasPawn3D({ compact });
  const { root, head, cap, body } = rig;

  // Approved Matthias proportions: cap wider than the head, compact cream ball,
  // large simple black eyes and a heavy pawn body. No human jaw/eyelid anatomy.
  head.position.y = .395;
  head.scale.set(.935, .915, .92);

  rig.leftEye.position.set(-.178, .405, .548);
  rig.rightEye.position.set(.178, .405, .548);
  rig.leftEye.scale.set(.84, 1.52, .42);
  rig.rightEye.scale.set(.84, 1.52, .42);

  const leftGlint = node(root, 'eye-left-glint');
  const rightGlint = node(root, 'eye-right-glint');
  if (leftGlint) leftGlint.visible = false;
  if (rightGlint) rightGlint.visible = false;

  rig.leftBrow.position.set(-.18, .575, .555);
  rig.rightBrow.position.set(.18, .575, .555);
  rig.leftBrow.scale.set(1.14, 1.14, 1.06);
  rig.rightBrow.scale.set(1.14, 1.14, 1.06);
  rig.leftBrow.rotation.z = Math.PI / 2 - .42;
  rig.rightBrow.rotation.z = Math.PI / 2 + .42;

  rig.mouthGroup.position.set(0, .19, .565);
  rig.mouthGroup.scale.set(.96, .96, .96);
  rig.speechMouth.position.set(0, .18, .558);

  cap.scale.set(1.14, 1.08, 1.08);
  cap.position.y = -.045;
  body.scale.set(1.035, 1.01, 1.035);
  rig.emblem.scale.setScalar(.98);

  const neck = node(root, 'neck-ring');
  if (neck) neck.scale.set(1.08, 1, 1.08);

  setMaterial(head, {
    color: 0xe8c990,
    roughness: .34,
    metalness: .01,
    clearcoat: .18,
  });
  setMaterial(node(root, 'premium-coat-body'), {
    color: 0x0b0d10,
    roughness: .24,
    metalness: .50,
    clearcoat: .62,
  });
  setMaterial(node(root, 'cap-red-band'), {
    color: 0x78241d,
    roughness: .31,
    metalness: .24,
    clearcoat: .36,
  });
  setMaterial(node(root, 'cap-top-piping'), {
    color: 0xc99637,
    roughness: .18,
    metalness: 1,
  });

  root.name = MATTHIAS_PREMIUM_HOME_MODEL_VERSION;
  root.userData.modelVersion = MATTHIAS_PREMIUM_HOME_MODEL_VERSION;
  root.userData.faceRigVersion = MATTHIAS_PREMIUM_HOME_FACE_RIG_VERSION;
  root.userData.fidelityVersion = MATTHIAS_PREMIUM_HOME_FIDELITY_VERSION;
  root.userData.renderContract = MATTHIAS_PREMIUM_HOME_RENDER_CONTRACT;
  root.userData.approvedReference = MATTHIAS_PREMIUM_HOME_REFERENCE;
  root.userData.emblem = MATTHIAS_PAWN_EMBLEM;

  refreshBase(rig);
  return rig;
}

export function applyMatthiasPremiumHomePose(rig, pose) {
  if (!rig || !pose) return;
  applyMatthiasPawnPose(rig, pose);

  // A blink may soften the eyes but must never turn Matthias into a squinting
  // stranger. The approved face keeps large vertical eyes at every frame.
  const blink = Math.max(0, Math.min(1, Number(pose.blink) || 0));
  const eyeScaleY = 1.52 * (1 - blink * .18);
  rig.leftEye.scale.set(.84, eyeScaleY, .42);
  rig.rightEye.scale.set(.84, eyeScaleY, .42);

  if (rig.speechMouth.visible) {
    const mouthOpen = Math.max(0, Math.min(1, Number(pose.mouthOpen) || 0));
    rig.speechMouth.scale.y = .15 + mouthOpen * .35;
    rig.speechMouth.scale.x = 1.18 + mouthOpen * .10;
    rig.speechMouth.scale.z = .43;
  }

  // Home is orthographic and identity-locked: no model zoom or Z drift.
  rig.root.position.z = 0;
  rig.root.scale.set(1, 1, 1);
}

export function disposeMatthiasPremiumHome3D(rig) {
  disposeMatthiasPawn3D(rig);
}
