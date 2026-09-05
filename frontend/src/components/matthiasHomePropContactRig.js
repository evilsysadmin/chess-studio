import * as THREE from 'three';

export const MATTHIAS_HOME_PROP_CONTACT_RIG_VERSION = 'home-prop-contact-v1-sockets';

const HAND_SKIN = 0xe1c58c;
const CUFF_BLACK = 0x090b0e;
const CUFF_GOLD = 0xb37a28;
const UP = new THREE.Vector3(0, 1, 0);

const CONTACT_SPECS = Object.freeze({
  cup: {
    support: { node: 'campaign-cup-handle', point: [0, 0, 0], lift: .035 },
  },
  beer: {
    support: { node: 'campaign-beer-handle', point: [0, 0, 0], lift: .035 },
  },
  breakfast: {
    support: { node: 'activity-breakfast', point: [.205, -.025, .075], lift: .030 },
    assist: { node: 'activity-breakfast', point: [-.205, -.025, .075], lift: .030 },
  },
  book: {
    support: { node: 'activity-book', point: [.255, -.120, .085], lift: .038 },
    assist: { node: 'activity-book', point: [-.255, -.120, .085], lift: .038 },
  },
  dossier: {
    support: { node: 'dossier-mock-open-file', point: [.255, -.145, .055], lift: .040 },
    assist: { node: 'dossier-mock-open-file', point: [-.255, -.145, .055], lift: .040 },
  },
  write: {
    support: { node: 'activity-pen', point: [0, -.085, 0], lift: .025 },
    assist: { node: 'writing-dossier', point: [-.245, -.125, .060], lift: .038 },
  },
  press: {
    support: { node: 'activity-press', point: [.335, -.185, .045], lift: .040 },
    assist: { node: 'activity-press', point: [-.335, -.185, .045], lift: .040 },
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

export function clearMatthiasHomePropContactRig(rig) {
  const activityRig = rig?.activityRig;
  if (!activityRig) return;
  clearContactCuffs(activityRig);
  if (rig?.root?.userData) {
    rig.root.userData.activityPropContact = 'inactive';
    rig.root.userData.activityPropContactProp = 'none';
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
    const support = ensurePrivateGameSupport(rig);
    if (!support) {
      clearMatthiasHomePropContactRig(rig);
      return null;
    }
    root.userData.activityPropContact = MATTHIAS_HOME_PROP_CONTACT_RIG_VERSION;
    root.userData.activityPropContactProp = 'chess';
    root.userData.activityPropContactHands = 'board-rest/pointing-hand';
    return { prop: 'chess', boardSupport: support, supportSolved: false, assistSolved: false };
  }

  const spec = CONTACT_SPECS[prop];

  // Dedicated rigs own these contacts: tactical meal choreography and sleeping
  // cloth. Do not fight them with generic limbs.
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
  root.userData.activityPropContactHands = `${supportSolved ? 1 : 0}/${assistSolved ? 1 : 0}`;

  return {
    prop,
    supportTarget: supportTarget?.clone?.() || null,
    assistTarget: assistTarget?.clone?.() || null,
    supportSolved,
    assistSolved,
  };
}
