import * as THREE from 'three';

export const MATTHIAS_HOME_PROP_CONTACT_RIG_VERSION = 'home-prop-contact-v3-contextual-interaction';

const HAND_SKIN = 0xe1c58c;
const CUFF_BLACK = 0x090b0e;
const CUFF_GOLD = 0xb37a28;
const UP = new THREE.Vector3(0, 1, 0);

// Props belong to the room, not to Matthias' silhouette. These sockets describe
// where a hand may touch an object after that object has been staged on furniture.
// A missing assist socket is deliberate: reading is an interaction, not a two-hand
// product demo in front of his chest.
const CONTACT_SPECS = Object.freeze({
  cup: {
    support: { node: 'campaign-cup-handle', point: [0, 0, 0], lift: .035 },
  },
  beer: {
    support: { node: 'campaign-beer-handle', point: [0, 0, 0], lift: .035 },
  },
  breakfast: {
    support: { node: 'campaign-cup-handle', point: [0, 0, 0], lift: .028 },
    assist: { node: 'breakfast-croissant', point: [.02, .01, .02], lift: .020 },
  },
  book: {
    support: { node: 'activity-book', point: [.18, -.015, .090], lift: .030 },
  },
  dossier: {
    support: { node: 'dossier-mock-page-right', point: [.055, -.035, .035], lift: .028 },
  },
  write: {
    support: { node: 'activity-pen', point: [0, -.085, 0], lift: .025 },
    assist: { node: 'writing-dossier', point: [-.185, -.080, .070], lift: .020 },
  },
  press: {
    support: { node: 'chess-weekly-right-page', point: [.115, -.115, .035], lift: .024 },
  },
});

function ensureHandMaterial(glove) {
  if (!glove?.material || glove.userData?.matthiasContactSkin === true) return;
  glove.material = glove.material.clone();
  glove.material.color?.setHex?.(HAND_SKIN);
  if ('roughness' in glove.material) glove.material.roughness = .48;
  if ('metalness' in glove.material) glove.material.metalness = .02;
  if ('clearcoat' in glove.material) glove.material.clearcoat = .12;
  glove.userData.matthiasContactSkin = true;
}

function ensureCuff(owner, key) {
  if (!owner) return null;
  const existing = owner.getObjectByName(`activity-${key}-contact-cuff`);
  if (existing) return existing;

  const group = new THREE.Group();
  group.name = `activity-${key}-contact-cuff`;
  group.visible = false;
  owner.add(group);

  const black = new THREE.MeshStandardMaterial({ color: CUFF_BLACK, roughness: .30, metalness: .34 });
  const gold = new THREE.MeshStandardMaterial({ color: CUFF_GOLD, roughness: .24, metalness: .82 });

  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(.074, .081, .066, 14), black);
  sleeve.name = `activity-${key}-contact-cuff-sleeve`;
  group.add(sleeve);

  const trim = new THREE.Mesh(new THREE.TorusGeometry(.079, .010, 6, 18), gold);
  trim.name = `activity-${key}-contact-cuff-gold`;
  trim.position.y = .035;
  trim.rotation.x = Math.PI / 2;
  group.add(trim);

  return group;
}

function ensureInteractionSurface(rig) {
  const activityRig = rig?.activityRig;
  if (!activityRig) return null;
  if (activityRig.objectInteractionSurface) return activityRig.objectInteractionSurface;

  const surface = new THREE.Group();
  surface.name = 'home-object-interaction-surface';
  surface.visible = false;
  activityRig.root.add(surface);

  const wood = new THREE.MeshStandardMaterial({ color: 0x24140d, roughness: .58, metalness: .08 });
  const edge = new THREE.MeshStandardMaterial({ color: 0x6b3d20, roughness: .38, metalness: .18 });
  const gold = new THREE.MeshStandardMaterial({ color: CUFF_GOLD, roughness: .24, metalness: .82 });

  const top = new THREE.Mesh(new THREE.BoxGeometry(1.02, .075, .32), wood);
  top.name = 'home-object-interaction-table-top';
  surface.add(top);

  const lip = new THREE.Mesh(new THREE.BoxGeometry(1.06, .022, .34), edge);
  lip.name = 'home-object-interaction-table-edge';
  lip.position.y = .044;
  surface.add(lip);

  for (const x of [-.39, .39]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(.085, .28, .11), wood);
    leg.name = 'home-object-interaction-table-leg';
    leg.position.set(x, -.17, -.025);
    surface.add(leg);

    const foot = new THREE.Mesh(new THREE.BoxGeometry(.14, .030, .15), gold);
    foot.name = 'home-object-interaction-table-foot';
    foot.position.set(x, -.325, -.025);
    surface.add(foot);
  }

  activityRig.objectInteractionSurface = surface;
  return surface;
}

function setGroupPose(group, position, rotation, scale = 1) {
  if (!group) return;
  group.position.set(...position);
  group.rotation.set(...rotation);
  group.scale.setScalar(scale);
}

function stageObjectInEnvironment(rig, prop) {
  const activityRig = rig?.activityRig;
  const root = rig?.root;
  if (!activityRig || !root) return;

  const surface = ensureInteractionSurface(rig);
  if (surface) surface.visible = false;
  root.userData.activityPropRelationship = 'environment-interaction';
  root.userData.activityObjectStaging = 'none';

  if (prop === 'cup') {
    if (surface) {
      surface.visible = true;
      setGroupPose(surface, [.38, -.625, .61], [0, 0, -.015], .72);
    }
    setGroupPose(activityRig.cup, [.48, -.48, .77], [.01, -.05, -.04], .80);
    root.userData.activityObjectStaging = 'side-table';
    return;
  }

  if (prop === 'beer') {
    if (surface) {
      surface.visible = true;
      setGroupPose(surface, [.38, -.625, .61], [0, 0, -.015], .72);
    }
    setGroupPose(activityRig.beer, [.47, -.46, .77], [.01, -.04, -.035], .80);
    root.userData.activityObjectStaging = 'side-table';
    return;
  }

  if (prop === 'breakfast') {
    if (surface) {
      surface.visible = true;
      setGroupPose(surface, [.02, -.65, .61], [0, 0, 0], .92);
    }
    setGroupPose(activityRig.breakfast, [.19, -.565, .79], [-.30, -.04, -.035], .78);
    setGroupPose(activityRig.cup, [-.35, -.49, .78], [.01, .05, .035], .72);
    root.userData.activityObjectStaging = 'breakfast-table';
    return;
  }

  if (prop === 'book') {
    if (surface) {
      surface.visible = true;
      setGroupPose(surface, [-.06, -.675, .61], [0, 0, .015], .92);
    }
    setGroupPose(activityRig.book, [-.08, -.61, .80], [-.68, .10, .035], .78);
    root.userData.activityObjectStaging = 'reading-desk';
    return;
  }

  if (prop === 'dossier') {
    // The dossier mock already owns a desk, books and mug. Move only the open
    // file down onto that desk; the desk itself remains exactly where the mock
    // placed it. Matthias may touch a page, but never carries the expediente.
    const document = root.getObjectByName('dossier-mock-open-file');
    if (document) {
      document.position.set(.03, -.605, .80);
      document.rotation.set(-.58, 0, -.015);
    }
    root.userData.activityObjectStaging = 'dossier-desk';
    return;
  }

  if (prop === 'write') {
    if (surface) {
      surface.visible = true;
      setGroupPose(surface, [.04, -.68, .61], [0, 0, -.015], .92);
    }
    setGroupPose(activityRig.write, [.10, -.625, .79], [-.64, -.18, -.08], .76);
    root.userData.activityObjectStaging = 'writing-desk';
    return;
  }

  if (prop === 'press') {
    if (surface) {
      surface.visible = true;
      setGroupPose(surface, [.02, -.68, .61], [0, 0, 0], .94);
    }
    // Chess Weekly used to sit upright across Matthias' torso with a hand on
    // each lower corner: visually, a newspaper vendor. Keep the approved paper
    // model and page-turn animation, but lay it on the reading desk below his
    // chest. One hand may follow the active page; the other stays free.
    setGroupPose(activityRig.press, [.035, -.575, .84], [-.66, .055, .015], .88);
    root.userData.activityObjectStaging = 'reading-desk';
  }
}

function dynamicContactSpec(rig, prop) {
  if (prop !== 'press') return CONTACT_SPECS[prop];
  const turning = Number(rig?.root?.userData?.activityPageTurn) || 0;
  if (turning <= .05) return CONTACT_SPECS.press;
  return {
    support: { node: 'chess-weekly-page-turn-leaf', point: [.14, -.12, .025], lift: .020 },
  };
}

function ensurePrivateGameSupport(rig) {
  const activityRig = rig?.activityRig;
  const scene = activityRig?.privateGame || rig?.root?.getObjectByName('activity-private-game-mock');
  if (!activityRig || !scene) return null;
  if (activityRig.privateGameSupport) {
    activityRig.privateGameSupport.visible = true;
    return activityRig.privateGameSupport;
  }

  const support = new THREE.Group();
  support.name = 'private-game-table-support';
  support.position.set(0, -.835, .615);
  scene.add(support);

  const wood = new THREE.MeshStandardMaterial({ color: 0x24140d, roughness: .54, metalness: .10 });
  const edge = new THREE.MeshStandardMaterial({ color: 0x7b451d, roughness: .34, metalness: .22 });
  const gold = new THREE.MeshStandardMaterial({ color: CUFF_GOLD, roughness: .24, metalness: .82 });

  const top = new THREE.Mesh(new THREE.BoxGeometry(1.22, .105, .30), wood);
  top.name = 'private-game-table-top';
  support.add(top);

  const lip = new THREE.Mesh(new THREE.BoxGeometry(1.18, .026, .315), edge);
  lip.name = 'private-game-table-edge';
  lip.position.y = .057;
  support.add(lip);

  for (const x of [-.47, .47]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(.11, .34, .13), wood);
    leg.name = 'private-game-table-leg';
    leg.position.set(x, -.205, -.035);
    support.add(leg);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(.18, .035, .17), gold);
    foot.name = 'private-game-table-foot';
    foot.position.set(x, -.382, -.035);
    support.add(foot);
  }

  activityRig.privateGameSupport = support;
  return support;
}

function resolveSocket(owner, root, spec) {
  if (!owner || !root || !spec) return null;
  const node = root.getObjectByName(spec.node);
  if (!node) return null;

  root.updateMatrixWorld(true);
  owner.updateMatrixWorld(true);
  node.updateMatrixWorld(true);

  const world = node.localToWorld(new THREE.Vector3(...spec.point));
  const local = owner.worldToLocal(world);
  local.z += Number(spec.lift) || 0;
  return local;
}

function solveArm({ owner, stem, glove, cuff, shoulder, target }) {
  if (!owner || !stem || !glove || !target) return false;

  ensureHandMaterial(glove);

  const from = new THREE.Vector3(...shoulder);
  const delta = target.clone().sub(from);
  const distance = Math.max(.001, delta.length());
  const direction = delta.clone().normalize();
  const midpoint = from.clone().add(target).multiplyScalar(.5);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(UP, direction);

  stem.position.copy(midpoint);
  stem.quaternion.copy(quaternion);
  stem.scale.set(1.06, Math.max(.72, Math.min(1.72, distance / .43)), 1.06);

  glove.position.copy(target);
  glove.quaternion.copy(quaternion);
  glove.scale.set(1.08, .82, .94);

  if (cuff) {
    cuff.visible = true;
    cuff.position.copy(target).addScaledVector(direction, -.095);
    cuff.quaternion.copy(quaternion);
    cuff.scale.set(1, 1, 1);
  }

  return true;
}

function clearContactCuffs(activityRig) {
  const supportCuff = activityRig?.support?.getObjectByName('activity-support-contact-cuff');
  const assistCuff = activityRig?.assist?.getObjectByName('activity-assist-contact-cuff');
  if (supportCuff) supportCuff.visible = false;
  if (assistCuff) assistCuff.visible = false;
}

function hideInteractionSurface(activityRig) {
  if (activityRig?.objectInteractionSurface) activityRig.objectInteractionSurface.visible = false;
}

function applySleepHeadSupport(rig) {
  const activityRig = rig?.activityRig;
  if (!activityRig || rig?.root?.userData?.activitySleepState === 'inactive') return null;

  clearContactCuffs(activityRig);
  hideInteractionSurface(activityRig);
  const {
    support,
    supportStem,
    supportGlove,
    assist,
    assistStem,
    assistGlove,
  } = activityRig;

  // The v3 sleep rig originally parked both glove spheres at eye height and in
  // front of the face. At portrait size that rendered as mysterious dots on
  // Matthias' cheeks. Keep the hands as head support, but place them lower and
  // slightly behind the facial plane so the cream face remains completely clear.
  support.visible = true;
  assist.visible = true;
  supportStem.position.set(.21, .12, .43);
  supportStem.rotation.set(1.02, 0, -.38);
  supportStem.scale.set(1, 1, 1);
  supportGlove.position.set(.22, .255, .505);
  supportGlove.rotation.set(0, 0, -.12);
  supportGlove.scale.set(1.00, .72, .86);

  assistStem.position.set(-.20, .13, .42);
  assistStem.rotation.set(1.00, 0, .40);
  assistStem.scale.set(1, 1, 1);
  assistGlove.position.set(-.13, .285, .495);
  assistGlove.rotation.set(0, 0, .10);
  assistGlove.scale.set(.98, .70, .84);

  rig.root.userData.activityPropContact = MATTHIAS_HOME_PROP_CONTACT_RIG_VERSION;
  rig.root.userData.activityPropContactProp = 'blanket';
  rig.root.userData.activityPropContactHands = 'sleep-head-support';
  rig.root.userData.activitySleepFaceClearance = 'hands-below-and-behind-face';
  rig.root.userData.activityPropRelationship = 'body-support';
  rig.root.userData.activityObjectStaging = 'sleep-rig';

  return {
    prop: 'blanket',
    sleepSupport: true,
    supportSolved: true,
    assistSolved: true,
  };
}

export function clearMatthiasHomePropContactRig(rig) {
  const activityRig = rig?.activityRig;
  if (!activityRig) return;
  clearContactCuffs(activityRig);
  hideInteractionSurface(activityRig);
  if (rig?.root?.userData) {
    rig.root.userData.activityPropContact = 'inactive';
    rig.root.userData.activityPropContactProp = 'none';
    rig.root.userData.activitySleepFaceClearance = 'inactive';
    rig.root.userData.activityPropRelationship = 'inactive';
    rig.root.userData.activityObjectStaging = 'none';
  }
}

export function applyMatthiasHomePropContactRig(rig) {
  const activityRig = rig?.activityRig;
  const root = rig?.root;
  if (!activityRig || !root) return null;

  const prop = String(root.userData?.activityProp || 'none');

  // Partida privada has its own dedicated pointing hand. The board itself must
  // still obey the same physical rule as every other prop: it rests on furniture.
  if (prop === 'chess') {
    clearContactCuffs(activityRig);
    hideInteractionSurface(activityRig);
    const support = ensurePrivateGameSupport(rig);
    if (!support) {
      clearMatthiasHomePropContactRig(rig);
      return null;
    }
    root.userData.activityPropContact = MATTHIAS_HOME_PROP_CONTACT_RIG_VERSION;
    root.userData.activityPropContactProp = 'chess';
    root.userData.activityPropContactHands = 'board-rest/pointing-hand';
    root.userData.activitySleepFaceClearance = 'inactive';
    root.userData.activityPropRelationship = 'environment-interaction';
    root.userData.activityObjectStaging = 'private-game-table';
    return { prop: 'chess', boardSupport: support, supportSolved: false, assistSolved: false };
  }

  // Sleep keeps both hands, but the contact layer owns their final clearance so
  // no previous prop/contact pose can leave a glove sitting on Matthias' face.
  if (prop === 'blanket') return applySleepHeadSupport(rig);

  stageObjectInEnvironment(rig, prop);
  const spec = dynamicContactSpec(rig, prop);

  // Dedicated rigs own these contacts: tactical meal choreography. Do not fight
  // them with generic limb sockets.
  if (!spec) {
    clearMatthiasHomePropContactRig(rig);
    return null;
  }

  const supportOwner = activityRig.support;
  const assistOwner = activityRig.assist;
  const supportCuff = ensureCuff(supportOwner, 'support');
  const assistCuff = ensureCuff(assistOwner, 'assist');

  const supportTarget = resolveSocket(supportOwner, root, spec.support);
  const assistTarget = resolveSocket(assistOwner, root, spec.assist);

  const supportSolved = Boolean(supportTarget) && solveArm({
    owner: supportOwner,
    stem: activityRig.supportStem,
    glove: activityRig.supportGlove,
    cuff: supportCuff,
    shoulder: [.34, -.29, .51],
    target: supportTarget,
  });

  const assistSolved = Boolean(assistTarget) && solveArm({
    owner: assistOwner,
    stem: activityRig.assistStem,
    glove: activityRig.assistGlove,
    cuff: assistCuff,
    shoulder: [-.34, -.29, .50],
    target: assistTarget,
  });

  activityRig.support.visible = supportSolved;
  activityRig.assist.visible = assistSolved;
  if (!supportSolved && supportCuff) supportCuff.visible = false;
  if (!assistSolved && assistCuff) assistCuff.visible = false;

  root.userData.activityPropContact = MATTHIAS_HOME_PROP_CONTACT_RIG_VERSION;
  root.userData.activityPropContactProp = prop;
  root.userData.activityPropContactHands = `interaction:${supportSolved ? 1 : 0}/${assistSolved ? 1 : 0}`;
  root.userData.activitySleepFaceClearance = 'inactive';

  return {
    prop,
    supportTarget: supportTarget?.clone?.() || null,
    assistTarget: assistTarget?.clone?.() || null,
    supportSolved,
    assistSolved,
    staging: root.userData.activityObjectStaging,
  };
}
