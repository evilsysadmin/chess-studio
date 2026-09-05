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
export const MATTHIAS_PREMIUM_HOME_CAP_VERSION = 'officer-cap-v4-peaked-canonical';
export const MATTHIAS_PREMIUM_HOME_ACTIVITY_RIG_VERSION = 'activity-props-v2';
export const MATTHIAS_PREMIUM_HOME_ACTIVITY_COMPOSITION_VERSION = 'portrait-readable-v3';
export const MATTHIAS_PREMIUM_HOME_FRAME_SCALE = .94;
export const MATTHIAS_PREMIUM_HOME_FRAME_Y = -.05;
export { MATTHIAS_PAWN_EMBLEM };

const ACTIVITY_PROPS = Object.freeze({
  sip: 'cup',
  breakfast: 'breakfast',
  bite: 'ration',
  read: 'book',
  dossier: 'dossier',
  write: 'write',
  sleep: 'blanket',
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
  const plate = activityMaterial(0x343941, { metalness: .52, roughness: .28, clearcoat: .36 });
  const gold = activityMaterial(0xd09b37, { metalness: 1, roughness: .17, clearcoat: .30 });
  const ivory = activityMaterial(0xe0c28d, { metalness: .02, roughness: .36, clearcoat: .18 });
  const paper = activityMaterial(0xc7baa2, { metalness: 0, roughness: .64, clearcoat: .02 });
  const red = activityMaterial(0x6f211d, { metalness: .22, roughness: .34, clearcoat: .30 });
  const food = activityMaterial(0xa86b31, { metalness: 0, roughness: .72, clearcoat: .02 });
  const cloth = activityMaterial(0x4a201d, { metalness: 0, roughness: .86, clearcoat: 0 });

  // Arms are deliberately tiny and prop-driven. Matthias remains a pawn; the
  // limbs exist only long enough to make cups/books/dossiers feel physically held.
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

  const assist = new THREE.Group();
  assist.name = 'activity-assist';
  activityRoot.add(assist);
  const assistStem = activityMesh(
    assist,
    new THREE.CapsuleGeometry(.052, .34, compact ? 3 : 5, compact ? 8 : 12),
    black,
    { name: 'activity-assist-stem', position: [-.38, -.30, .47], rotation: [1.08, 0, .48] },
  );
  const assistGlove = activityMesh(
    assist,
    new THREE.SphereGeometry(.085, compact ? 12 : 18, compact ? 9 : 14),
    black,
    { name: 'activity-assist-glove', position: [-.47, -.09, .67], scale: [1.03, .74, .88] },
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
  ration.scale.setScalar(1.12);
  activityRoot.add(ration);
  activityMesh(ration, new THREE.CylinderGeometry(.26, .26, .032, compact ? 18 : 30), plate, {
    name: 'ration-plate', rotation: [Math.PI / 2, 0, 0],
  });
  activityMesh(ration, new THREE.TorusGeometry(.255, .013, 7, compact ? 18 : 30), gold, {
    name: 'ration-plate-rim', position: [0, 0, .018],
  });
  activityMesh(ration, new THREE.BoxGeometry(.22, .09, .16), food, {
    name: 'ration-piece', position: [.075, .065, .045], rotation: [.04, -.10, .10],
  });
  activityMesh(ration, new THREE.BoxGeometry(.16, .065, .14), ivory, {
    name: 'ration-bread', position: [-.075, .072, .055], rotation: [-.02, .12, -.08],
  });
  activityMesh(ration, new THREE.BoxGeometry(.055, .022, .24), gold, {
    name: 'ration-cutlery', position: [-.225, .052, .045], rotation: [0, .08, -.18],
  });

  const book = new THREE.Group();
  book.name = 'activity-book';
  activityRoot.add(book);
  activityMesh(book, new THREE.BoxGeometry(.32, .30, .035), paper, {
    name: 'book-pages-left', position: [-.15, 0, .035], rotation: [0, .26, .055],
  });
  activityMesh(book, new THREE.BoxGeometry(.32, .30, .035), paper, {
    name: 'book-pages-right', position: [.15, 0, .035], rotation: [0, -.26, -.055],
  });
  activityMesh(book, new THREE.BoxGeometry(.34, .32, .018), red, {
    name: 'book-cover-left', position: [-.17, -.006, -.012], rotation: [0, .30, .055],
  });
  activityMesh(book, new THREE.BoxGeometry(.34, .32, .018), red, {
    name: 'book-cover-right', position: [.17, -.006, -.012], rotation: [0, -.30, -.055],
  });
  activityMesh(book, new THREE.CylinderGeometry(.014, .014, .34, 10), gold, {
    name: 'book-spine', position: [0, 0, .05],
  });

  const dossier = new THREE.Group();
  dossier.name = 'activity-dossier';
  activityRoot.add(dossier);
  activityMesh(dossier, new THREE.BoxGeometry(.56, .34, .035), red, {
    name: 'dossier-folder', rotation: [-.08, .02, .02],
  });
  activityMesh(dossier, new THREE.BoxGeometry(.47, .26, .018), paper, {
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
  const penPivot = new THREE.Group();
  penPivot.name = 'activity-pen-pivot';
  write.add(penPivot);
  activityMesh(penPivot, new THREE.CylinderGeometry(.012, .012, .36, 10), gold, {
    name: 'activity-pen', position: [.11, .08, .08], rotation: [0, 0, -.72],
  });

  const blanket = new THREE.Group();
  blanket.name = 'activity-blanket';
  activityRoot.add(blanket);
  activityMesh(blanket, new THREE.BoxGeometry(1.10, .50, .12), cloth, {
    name: 'sleep-blanket-body', position: [0, 0, 0], rotation: [-.10, 0, 0], scale: [1, .96, 1],
  });
  activityMesh(blanket, new THREE.BoxGeometry(1.12, .042, .135), gold, {
    name: 'sleep-blanket-trim', position: [0, .235, .01], rotation: [-.10, 0, 0],
  });

  for (const group of [cup, ration, book, dossier, write, blanket, support, assist]) group.visible = false;

  const activityRig = {
    root: activityRoot,
    support,
    supportStem,
    supportGlove,
    assist,
    assistStem,
    assistGlove,
    cup,
    ration,
    book,
    dossier,
    write,
    blanket,
    penPivot,
    currentProp: 'none',
  };
  rig.activityRig = activityRig;
  rig.root.userData.activityRigVersion = MATTHIAS_PREMIUM_HOME_ACTIVITY_RIG_VERSION;
  rig.root.userData.activityCompositionVersion = MATTHIAS_PREMIUM_HOME_ACTIVITY_COMPOSITION_VERSION;
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
  const {
    cup,
    ration,
    book,
    dossier,
    write,
    blanket,
    support,
    supportStem,
    supportGlove,
    assist,
    assistStem,
    assistGlove,
    penPivot,
  } = activityRig;
  const breakfast = prop === 'breakfast';
  const twoHands = breakfast || prop === 'ration' || prop === 'book' || prop === 'dossier' || prop === 'write';

  cup.visible = prop === 'cup' || breakfast;
  ration.visible = prop === 'ration' || breakfast;
  book.visible = prop === 'book';
  dossier.visible = prop === 'dossier';
  write.visible = prop === 'write';
  blanket.visible = prop === 'blanket';
  support.visible = prop !== 'none' && prop !== 'blanket';
  assist.visible = twoHands;

  if (breakfast) {
    cup.position.set(-.38, -.45 + reach * .18, .79 + reach * .02);
    cup.rotation.set(.02 + reach * .08, .08, .08);
    ration.position.set(.38, -.60 + reach * .08, .78);
    ration.rotation.set(-.10, -.10, -.04);
  } else if (prop === 'cup') {
    cup.position.set(.56 - reach * .26, -.26 + reach * .55, .78 + reach * .05);
    cup.rotation.set(.03 + reach * .16, -.08, -.10 - reach * .08);
  } else if (prop === 'ration') {
    // A plate is presented, not drunk from. Keep the high-contrast ration in the
    // lower-right portrait zone and let reach lift it only slightly toward Matthias.
    ration.position.set(.62 - reach * .12, -.56 + reach * .16, .80 + reach * .04);
    ration.rotation.set(-.08 + reach * .10, -.12, -.10);
  } else if (prop === 'book') {
    book.position.set(-.10, -.50 + reach * .10, .82);
    book.rotation.set(-.34 + reach * .06, Number(pose?.headYaw || 0) * .12, .035);
  } else if (prop === 'dossier') {
    dossier.position.set(.13, -.49 + reach * .08, .83);
    dossier.rotation.set(-.28 + reach * .06, Number(pose?.headYaw || 0) * .10, -.055);
  } else if (prop === 'write') {
    write.position.set(.12, -.50 + reach * .07, .84);
    write.rotation.set(-.27, Number(pose?.headYaw || 0) * .09, -.045);
    penPivot.rotation.z = -.08 + Math.sin((Number(pose?.headYaw) || 0) * 18) * .08;
    penPivot.position.y = Math.abs(Number(pose?.headYaw) || 0) * .18;
  } else if (prop === 'blanket') {
    // Sleep must not hand off from a lovely 2D blanket to a naked base pawn.
    // Keep the cloth below the face, attached to the same rigid body motion.
    blanket.position.set(0, -.57, .64);
    blanket.rotation.set(-.04, 0, Number(pose?.headRoll || 0) * .08);
  }

  if (support.visible) {
    const documentProp = prop === 'book' || prop === 'dossier' || prop === 'write';
    if (breakfast) {
      supportStem.position.set(.40, -.46 + reach * .06, .48);
      supportStem.rotation.z = -.54;
      supportGlove.position.set(.46, -.34 + reach * .08, .72);
    } else if (prop === 'ration') {
      supportStem.position.set(.43, -.42 + reach * .12, .50);
      supportStem.rotation.z = -.52;
      supportGlove.position.set(.50, -.29 + reach * .14, .74);
    } else {
      supportStem.position.x = documentProp ? .39 : .42 - reach * .07;
      supportStem.position.y = documentProp ? -.30 + reach * .08 : -.30 + reach * .29;
      supportStem.rotation.z = documentProp ? -.58 : -.50 - reach * .15;
      supportGlove.position.x = documentProp ? .43 : .54 - reach * .15;
      supportGlove.position.y = documentProp ? -.20 + reach * .10 : -.09 + reach * .30;
      supportGlove.position.z = .72 + reach * .03;
    }
  }

  if (assist.visible) {
    const documentProp = prop === 'book' || prop === 'dossier' || prop === 'write';
    if (breakfast) {
      assistStem.position.set(-.36, -.36 + reach * .10, .47);
      assistStem.rotation.z = .52;
      assistGlove.position.set(-.40, -.24 + reach * .12, .70);
    } else if (prop === 'ration') {
      assistStem.position.set(-.34, -.43 + reach * .10, .48);
      assistStem.rotation.z = .50;
      assistGlove.position.set(-.38, -.31 + reach * .12, .71);
    } else if (documentProp) {
      assistStem.position.set(-.37, -.31 + reach * .07, .47);
      assistStem.rotation.z = .58;
      assistGlove.position.set(-.42, -.21 + reach * .09, .71);
    }
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
  const visor = node(root, 'cap-curved-visor');
  const visorTrim = node(root, 'cap-visor-gold-trim');
  const cord = node(root, 'cap-braided-cord');
  const badge = node(root, 'cap-pawn-emblem');

  // The Home cap must read as a compact peaked officer cap, not a flat platter.
  // Keep the overall footprint smaller than v3, build a little crown height,
  // taper the top plate and expose enough visor surface to read at ~128 px.
  if (crown) {
    crown.scale.x = .98;
    crown.scale.y = 1.20;
    crown.position.y = .982;
  }
  if (top) {
    top.scale.x = .96;
    top.position.y = 1.112;
  }
  if (topPiping) {
    topPiping.scale.x = .96;
    topPiping.position.y = 1.084;
  }
  if (visor) {
    visor.position.set(0, .735, .345);
    visor.rotation.x = Math.PI / 2 - .22;
    visor.scale.set(.98, 1, 1.05);
  }
  if (visorTrim) {
    visorTrim.position.y = -.012;
    visorTrim.position.z = .012;
    visorTrim.scale.x = .98;
    visorTrim.scale.z = 1.01;
  }
  if (cord) {
    cord.position.y = -.008;
    cord.scale.x = .98;
  }
  if (badge) {
    badge.position.y = .955;
    badge.position.z = .535;
    badge.scale.setScalar(.40);
  }
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

  cap.scale.set(1.00, 1.04, 1.00);
  cap.position.y = -.055;
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
  root.userData.activityCompositionVersion = MATTHIAS_PREMIUM_HOME_ACTIVITY_COMPOSITION_VERSION;
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
