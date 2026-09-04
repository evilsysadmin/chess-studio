import * as THREE from 'three';
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
export const MATTHIAS_PREMIUM_HOME_CAP_VERSION = 'officer-cap-v2';
export const MATTHIAS_PREMIUM_HOME_ACTIVITY_RIG_VERSION = 'activity-props-v1';
export const MATTHIAS_PREMIUM_HOME_FRAME_SCALE = .94;
export const MATTHIAS_PREMIUM_HOME_FRAME_Y = -.05;
export { MATTHIAS_PAWN_EMBLEM };

const ACTIVITY_PROPS = Object.freeze({
  sip: 'cup',
  bite: 'ration',
  read: 'book',
  dossier: 'dossier',
  write: 'write',
});

function node(root, name) {
  return root?.getObjectByName?.(name) || null;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
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

function activityMaterial(color, {
  metalness = .45,
  roughness = .30,
  clearcoat = .28,
} = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness,
    roughness,
    clearcoat,
    clearcoatRoughness: .2,
  });
}

function activityMesh(parent, geometry, material, {
  name,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = [1, 1, 1],
} = {}) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name || '';
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.scale.set(...scale);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  parent.add(mesh);
  return mesh;
}

function buildActivityRig(rig, compact) {
  const activityRoot = new THREE.Group();
  activityRoot.name = 'home-activity-rig';
  activityRoot.position.set(0, -.06, .02);
  rig.root.add(activityRoot);

  const black = activityMaterial(0x101318, { metalness: .60, roughness: .24, clearcoat: .55 });
  const gold = activityMaterial(0xd09b37, { metalness: 1, roughness: .17, clearcoat: .30 });
  const ivory = activityMaterial(0xe0c28d, { metalness: .02, roughness: .36, clearcoat: .18 });
  const paper = activityMaterial(0xc7baa2, { metalness: 0, roughness: .64, clearcoat: .02 });
  const red = activityMaterial(0x6f211d, { metalness: .22, roughness: .34, clearcoat: .30 });
  const food = activityMaterial(0x8e5e31, { metalness: 0, roughness: .72, clearcoat: .02 });

  const support = new THREE.Group();
  support.name = 'activity-support';
  activityRoot.add(support);
  const supportStem = activityMesh(
    support,
    new THREE.CapsuleGeometry(.055, .37, compact ? 3 : 5, compact ? 8 : 12),
    black,
    { name: 'activity-support-stem', position: [.38, -.28, .48], rotation: [1.08, 0, -.48] },
  );
  const supportGlove = activityMesh(
    support,
    new THREE.SphereGeometry(.09, compact ? 12 : 18, compact ? 9 : 14),
    black,
    { name: 'activity-support-glove', position: [.49, -.05, .68], scale: [1.05, .76, .9] },
  );

  const cup = new THREE.Group();
  cup.name = 'activity-cup';
  activityRoot.add(cup);
  activityMesh(cup, new THREE.CylinderGeometry(.13, .115, .22, compact ? 18 : 28), ivory, {
    name: 'campaign-cup-body', position: [0, 0, 0],
  });
  activityMesh(cup, new THREE.TorusGeometry(.126, .012, 7, compact ? 18 : 28), gold, {
    name: 'campaign-cup-rim', position: [0, .11, 0], rotation: [Math.PI / 2, 0, 0],
  });
  const cupHandle = activityMesh(cup, new THREE.TorusGeometry(.085, .018, 7, compact ? 16 : 24, Math.PI * 1.58), gold, {
    name: 'campaign-cup-handle', position: [.13, .005, 0], rotation: [0, Math.PI / 2, -.32],
  });
  cupHandle.scale.y = .92;

  const ration = new THREE.Group();
  ration.name = 'activity-ration';
  activityRoot.add(ration);
  activityMesh(ration, new THREE.CylinderGeometry(.22, .22, .025, compact ? 18 : 28), black, {
    name: 'ration-plate', rotation: [Math.PI / 2, 0, 0],
  });
  activityMesh(ration, new THREE.BoxGeometry(.20, .09, .16), food, {
    name: 'ration-piece', position: [.02, .065, .015], rotation: [.04, -.10, .08],
  });
  activityMesh(ration, new THREE.BoxGeometry(.06, .025, .22), gold, {
    name: 'ration-cutlery', position: [-.19, .045, .02], rotation: [0, .08, -.16],
  });

  const book = new THREE.Group();
  book.name = 'activity-book';
  activityRoot.add(book);
  activityMesh(book, new THREE.BoxGeometry(.34, .29, .035), paper, {
    name: 'book-pages-left', position: [-.17, 0, 0], rotation: [0, .12, .04],
  });
  activityMesh(book, new THREE.BoxGeometry(.34, .29, .035), paper, {
    name: 'book-pages-right', position: [.17, 0, 0], rotation: [0, -.12, -.04],
  });
  activityMesh(book, new THREE.BoxGeometry(.36, .31, .018), red, {
    name: 'book-cover-left', position: [-.18, 0, -.025], rotation: [0, .12, .04],
  });
  activityMesh(book, new THREE.BoxGeometry(.36, .31, .018), red, {
    name: 'book-cover-right', position: [.18, 0, -.025], rotation: [0, -.12, -.04],
  });
  activityMesh(book, new THREE.CylinderGeometry(.018, .018, .31, 10), gold, {
    name: 'book-spine', rotation: [0, 0, Math.PI / 2],
  });

  const dossier = new THREE.Group();
  dossier.name = 'activity-dossier';
  activityRoot.add(dossier);
  activityMesh(dossier, new THREE.BoxGeometry(.58, .36, .035), red, {
    name: 'dossier-folder', rotation: [-.08, .02, .02],
  });
  activityMesh(dossier, new THREE.BoxGeometry(.49, .28, .018), paper, {
    name: 'dossier-paper', position: [0, .015, .028], rotation: [-.08, .02, .02],
  });
  activityMesh(dossier, new THREE.BoxGeometry(.16, .025, .025), gold, {
    name: 'dossier-classified-bar', position: [0, .035, .052], rotation: [-.08, .02, .02],
  });

  const write = new THREE.Group();
  write.name = 'activity-write';
  activityRoot.add(write);
  const writingPad = dossier.clone(true);
  writingPad.name = 'writing-dossier';
  write.add(writingPad);
  dossier.remove(writingPad);
  const penPivot = new THREE.Group();
  penPivot.name = 'activity-pen-pivot';
  write.add(penPivot);
  activityMesh(penPivot, new THREE.CylinderGeometry(.012, .012, .36, 10), gold, {
    name: 'activity-pen', position: [.11, .08, .08], rotation: [0, 0, -.72],
  });

  for (const group of [cup, ration, book, dossier, write, support]) group.visible = false;

  const activityRig = {
    root: activityRoot,
    support,
    supportStem,
    supportGlove,
    cup,
    ration,
    book,
    dossier,
    write,
    penPivot,
    currentProp: 'none',
  };
  rig.activityRig = activityRig;
  rig.root.userData.activityRigVersion = MATTHIAS_PREMIUM_HOME_ACTIVITY_RIG_VERSION;
  rig.root.userData.activityProp = 'none';
  return activityRig;
}

export function matthiasPremiumHomeActivityProp(profile = '') {
  return ACTIVITY_PROPS[String(profile || '').trim().toLowerCase()] || 'none';
}

function effectiveActivityReach(profile, pose) {
  const direct = clamp01(pose?.reach);
  if (profile === 'read') return Math.max(.16, Math.min(.30, .18 + Math.abs(Number(pose?.headYaw) || 0) * .65));
  if (profile === 'dossier') return Math.max(.20, Math.min(.34, .23 + Math.abs(Number(pose?.headYaw) || 0) * .55));
  if (profile === 'write') return Math.max(.28, Math.min(.44, .31 + Math.abs(Number(pose?.headYaw) || 0) * .80));
  return direct;
}

function applyActivityPose(rig, pose) {
  const activityRig = rig?.activityRig;
  if (!activityRig) return;
  const profile = String(pose?.activityProfile || '').trim().toLowerCase();
  const prop = matthiasPremiumHomeActivityProp(profile);
  const reach = effectiveActivityReach(profile, pose);
  const { cup, ration, book, dossier, write, support, supportStem, supportGlove, penPivot } = activityRig;

  cup.visible = prop === 'cup';
  ration.visible = prop === 'ration';
  book.visible = prop === 'book';
  dossier.visible = prop === 'dossier';
  write.visible = prop === 'write';
  support.visible = prop !== 'none';

  if (prop === 'cup') {
    cup.position.set(.53 - reach * .32, -.24 + reach * .57, .72 + reach * .06);
    cup.rotation.set(.03 + reach * .16, -.08, -.10 - reach * .08);
  } else if (prop === 'ration') {
    ration.position.set(.48 - reach * .27, -.29 + reach * .51, .72 + reach * .05);
    ration.rotation.set(-.16 + reach * .16, -.05, -.08);
  } else if (prop === 'book') {
    book.position.set(0, -.43 + reach * .12, .73);
    book.rotation.set(-.44 + reach * .11, Number(pose?.headYaw || 0) * .18, 0);
  } else if (prop === 'dossier') {
    dossier.position.set(.04, -.39 + reach * .10, .74);
    dossier.rotation.set(-.34 + reach * .08, Number(pose?.headYaw || 0) * .12, -.035);
  } else if (prop === 'write') {
    write.position.set(.03, -.40 + reach * .08, .74);
    write.rotation.set(-.32, Number(pose?.headYaw || 0) * .10, -.025);
    penPivot.rotation.z = -.08 + Math.sin((Number(pose?.headYaw) || 0) * 18) * .08;
    penPivot.position.y = Math.abs(Number(pose?.headYaw) || 0) * .18;
  }

  if (support.visible) {
    const documentProp = prop === 'book' || prop === 'dossier' || prop === 'write';
    supportStem.position.x = documentProp ? .34 : .38 - reach * .09;
    supportStem.position.y = documentProp ? -.27 + reach * .10 : -.28 + reach * .34;
    supportStem.rotation.z = documentProp ? -.56 : -.48 - reach * .18;
    supportGlove.position.x = documentProp ? .38 : .49 - reach * .20;
    supportGlove.position.y = documentProp ? -.16 + reach * .12 : -.05 + reach * .37;
    supportGlove.position.z = .68 + reach * .03;
  }

  activityRig.currentProp = prop;
  rig.root.userData.activityProp = prop;
  rig.root.userData.activityReach = reach;
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

function refineOfficerCap(root) {
  const crown = node(root, 'cap-crown');
  const top = node(root, 'cap-top');
  const topPiping = node(root, 'cap-top-piping');

  // The base pawn cap was intentionally compact, but on the Home portrait that
  // made the officer crown read as if its upper half had been clipped away.
  // Keep the lower edge anchored to the red band and grow the crown upward,
  // matching the approved Matthias silhouette without changing face/body scale.
  if (crown) {
    crown.scale.y = 1.60;
    crown.position.y = 1.016;
  }
  if (top) top.position.y = 1.18;
  if (topPiping) topPiping.position.y = 1.155;
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
  refineOfficerCap(root);
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

  buildActivityRig(rig, compact);

  root.name = MATTHIAS_PREMIUM_HOME_MODEL_VERSION;
  root.userData.modelVersion = MATTHIAS_PREMIUM_HOME_MODEL_VERSION;
  root.userData.faceRigVersion = MATTHIAS_PREMIUM_HOME_FACE_RIG_VERSION;
  root.userData.fidelityVersion = MATTHIAS_PREMIUM_HOME_FIDELITY_VERSION;
  root.userData.renderContract = MATTHIAS_PREMIUM_HOME_RENDER_CONTRACT;
  root.userData.approvedReference = MATTHIAS_PREMIUM_HOME_REFERENCE;
  root.userData.capVersion = MATTHIAS_PREMIUM_HOME_CAP_VERSION;
  root.userData.activityRigVersion = MATTHIAS_PREMIUM_HOME_ACTIVITY_RIG_VERSION;
  root.userData.emblem = MATTHIAS_PAWN_EMBLEM;
  root.userData.frameScale = MATTHIAS_PREMIUM_HOME_FRAME_SCALE;
  root.userData.frameY = MATTHIAS_PREMIUM_HOME_FRAME_Y;

  refreshBase(rig);
  return rig;
}

export function applyMatthiasPremiumHomePose(rig, pose) {
  if (!rig || !pose) return;
  applyMatthiasPawnPose(rig, pose);
  applyActivityPose(rig, pose);

  // A blink may soften the eyes but must never turn Matthias into a squinting
  // stranger. The approved face keeps large vertical eyes at every frame.
  const blink = clamp01(pose.blink);
  const eyeScaleY = 1.52 * (1 - blink * .18);
  rig.leftEye.scale.set(.84, eyeScaleY, .42);
  rig.rightEye.scale.set(.84, eyeScaleY, .42);

  if (rig.speechMouth.visible) {
    const mouthOpen = clamp01(pose.mouthOpen);
    rig.speechMouth.scale.y = .15 + mouthOpen * .35;
    rig.speechMouth.scale.x = 1.18 + mouthOpen * .10;
    rig.speechMouth.scale.z = .43;
  }

  // Fixed Home framing: keep the wide officer cap inside the portrait safe area.
  // The constants never animate, so FSM gestures cannot introduce zoom or Z drift.
  rig.root.position.y = (Number(pose.bodyY) || 0) + MATTHIAS_PREMIUM_HOME_FRAME_Y;
  rig.root.position.z = 0;
  rig.root.scale.setScalar(MATTHIAS_PREMIUM_HOME_FRAME_SCALE);
}

export function disposeMatthiasPremiumHome3D(rig) {
  disposeMatthiasPawn3D(rig);
}
