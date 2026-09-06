import * as THREE from 'three';

export const MATTHIAS_STRATEGY_BOOKLET_RIG_VERSION = 'strategy-booklet-v1-open-two-hand';

const CLOCKS = new WeakMap();
const UP = new THREE.Vector3(0, 1, 0);
const HAND_SKIN = 0xe1c58c;

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function mesh(parent, geometry, material, {
  name = '',
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = [1, 1, 1],
} = {}) {
  const next = new THREE.Mesh(geometry, material);
  next.name = name;
  next.position.set(...position);
  next.rotation.set(...rotation);
  next.scale.set(...scale);
  next.castShadow = false;
  next.receiveShadow = false;
  parent.add(next);
  return next;
}

function material(color, roughness = .76, metalness = 0) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    side: THREE.DoubleSide,
  });
}

function addTextLines(parent, ink, {
  x = 0,
  y = .105,
  width = .22,
  count = 5,
  gap = .040,
  z = .020,
} = {}) {
  for (let index = 0; index < count; index += 1) {
    const shrink = index % 3 === 2 ? .76 : (index % 2 === 1 ? .90 : 1);
    mesh(parent, new THREE.BoxGeometry(width * shrink, .010, .008), ink, {
      name: 'strategy-booklet-text-line',
      position: [x, y - index * gap, z],
    });
  }
}

function disposeChildren(group) {
  for (const child of [...(group?.children || [])]) {
    // The legacy book uses materials shared with dossier/newspaper props. Only
    // retire geometry here; shared materials remain owned by the parent rig.
    child.traverse?.((node) => node.geometry?.dispose?.());
    group.remove(child);
  }
}

function buildBooklet(rig) {
  const activityRig = rig?.activityRig;
  const book = activityRig?.book;
  if (!activityRig || !book) return null;
  if (book.userData?.strategyBookletRig === MATTHIAS_STRATEGY_BOOKLET_RIG_VERSION) return book;

  disposeChildren(book);

  const paper = material(0xe4d7bc, .84, 0);
  const paperEdge = material(0xbcae92, .90, 0);
  const cover = material(0x5f211e, .52, .04);
  const ink = material(0x302c27, .92, 0);
  const gold = material(0xc99637, .30, .82);
  const diagramDark = material(0x4a4740, .86, 0);

  const leftPage = new THREE.Group();
  leftPage.name = 'strategy-booklet-left-page';
  leftPage.position.x = -.160;
  leftPage.rotation.y = .53;
  leftPage.rotation.z = .022;
  book.add(leftPage);

  const rightPage = new THREE.Group();
  rightPage.name = 'strategy-booklet-right-page';
  rightPage.position.x = .160;
  rightPage.rotation.y = -.53;
  rightPage.rotation.z = -.022;
  book.add(rightPage);

  mesh(leftPage, new THREE.BoxGeometry(.355, .445, .026), cover, {
    name: 'strategy-booklet-cover-left',
    position: [-.008, -.006, -.020],
  });
  mesh(rightPage, new THREE.BoxGeometry(.355, .445, .026), cover, {
    name: 'strategy-booklet-cover-right',
    position: [.008, -.006, -.020],
  });
  mesh(leftPage, new THREE.BoxGeometry(.335, .420, .028), paper, {
    name: 'strategy-booklet-paper-left',
    position: [0, .006, .010],
  });
  mesh(rightPage, new THREE.BoxGeometry(.335, .420, .028), paper, {
    name: 'strategy-booklet-paper-right',
    position: [0, .006, .010],
  });

  mesh(leftPage, new THREE.BoxGeometry(.225, .025, .010), gold, {
    name: 'strategy-booklet-heading-left',
    position: [-.015, .165, .032],
  });
  mesh(rightPage, new THREE.BoxGeometry(.215, .025, .010), gold, {
    name: 'strategy-booklet-heading-right',
    position: [.010, .165, .032],
  });
  addTextLines(leftPage, ink, { x: -.015, y: .115, width: .235, count: 6, gap: .041, z: .032 });
  addTextLines(rightPage, ink, { x: .010, y: .115, width: .225, count: 3, gap: .041, z: .032 });

  const diagram = new THREE.Group();
  diagram.name = 'strategy-booklet-diagram';
  diagram.position.set(.020, -.075, .034);
  rightPage.add(diagram);
  mesh(diagram, new THREE.BoxGeometry(.205, .145, .010), paperEdge, {
    name: 'strategy-booklet-diagram-field',
  });
  const squareW = .050;
  const squareH = .035;
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      if ((row + column) % 2 === 0) continue;
      mesh(diagram, new THREE.BoxGeometry(squareW * .92, squareH * .92, .008), diagramDark, {
        name: 'strategy-booklet-diagram-dark-square',
        position: [(column - 1.5) * squareW, (row - 1.5) * squareH, .010],
      });
    }
  }

  mesh(book, new THREE.BoxGeometry(.026, .425, .035), paperEdge, {
    name: 'strategy-booklet-central-fold',
    position: [0, .005, .030],
  });
  mesh(book, new THREE.BoxGeometry(.015, .438, .038), gold, {
    name: 'strategy-booklet-spine',
    position: [0, .004, -.018],
  });

  for (const [side, page] of [[-1, leftPage], [1, rightPage]]) {
    for (let layer = 0; layer < 3; layer += 1) {
      mesh(page, new THREE.BoxGeometry(.325, .008, .012), paperEdge, {
        name: 'strategy-booklet-page-edge',
        position: [side * .004, -.205 - layer * .006, -.002 - layer * .006],
      });
    }
  }

  const pageTurnPivot = new THREE.Group();
  pageTurnPivot.name = 'strategy-booklet-page-turn-pivot';
  pageTurnPivot.position.set(0, 0, .055);
  pageTurnPivot.visible = false;
  book.add(pageTurnPivot);
  mesh(pageTurnPivot, new THREE.BoxGeometry(.325, .410, .012), paper, {
    name: 'strategy-booklet-page-turn-leaf',
    position: [.1625, .006, 0],
  });
  mesh(pageTurnPivot, new THREE.BoxGeometry(.205, .022, .008), gold, {
    name: 'strategy-booklet-page-turn-heading',
    position: [.165, .160, .010],
  });
  addTextLines(pageTurnPivot, ink, { x: .165, y: .110, width: .215, count: 5, gap: .041, z: .010 });

  book.userData.strategyBookletRig = MATTHIAS_STRATEGY_BOOKLET_RIG_VERSION;
  activityRig.strategyBookletLeftPage = leftPage;
  activityRig.strategyBookletRightPage = rightPage;
  activityRig.strategyBookletPageTurnPivot = pageTurnPivot;
  rig.root.userData.activityStrategyBookletRig = MATTHIAS_STRATEGY_BOOKLET_RIG_VERSION;
  return book;
}

function ensureHandSkin(glove) {
  if (!glove?.material || glove.userData?.strategyBookletSkin === true) return;
  glove.material = glove.material.clone();
  glove.material.color?.setHex?.(HAND_SKIN);
  if ('roughness' in glove.material) glove.material.roughness = .48;
  if ('metalness' in glove.material) glove.material.metalness = .02;
  if ('clearcoat' in glove.material) glove.material.clearcoat = .12;
  glove.userData.strategyBookletSkin = true;
}

function localTarget(owner, node, point) {
  if (!owner || !node) return null;
  owner.updateMatrixWorld(true);
  node.updateMatrixWorld(true);
  const world = node.localToWorld(new THREE.Vector3(...point));
  return owner.worldToLocal(world);
}

function solveArm({ owner, stem, glove, shoulder, target }) {
  if (!owner || !stem || !glove || !target) return false;
  ensureHandSkin(glove);
  const from = new THREE.Vector3(...shoulder);
  const delta = target.clone().sub(from);
  const distance = Math.max(.001, delta.length());
  const direction = delta.clone().normalize();
  const midpoint = from.clone().add(target).multiplyScalar(.5);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(UP, direction);

  stem.position.copy(midpoint);
  stem.quaternion.copy(quaternion);
  stem.scale.set(1.04, Math.max(.76, Math.min(1.55, distance / .43)), 1.04);
  glove.position.copy(target);
  glove.quaternion.copy(quaternion);
  glove.scale.set(.94, .72, .86);
  return true;
}

function hideLegacyContactCuffs(activityRig) {
  const supportCuff = activityRig?.support?.getObjectByName('activity-support-contact-cuff');
  const assistCuff = activityRig?.assist?.getObjectByName('activity-assist-contact-cuff');
  if (supportCuff) supportCuff.visible = false;
  if (assistCuff) assistCuff.visible = false;
}

function elapsedSeconds(rig, pose, active) {
  const explicit = Number(pose?.activityTime);
  if (Number.isFinite(explicit)) return Math.max(0, explicit);
  if (!active) {
    CLOCKS.delete(rig);
    return 0;
  }
  const now = typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now() / 1000
    : Date.now() / 1000;
  const startedAt = CLOCKS.get(rig);
  if (!Number.isFinite(startedAt)) {
    CLOCKS.set(rig, now);
    return 0;
  }
  return Math.max(0, now - startedAt);
}

export function matthiasStrategyBookletReadingState(activityTime = 0, {
  speaking = false,
  reducedMotion = false,
} = {}) {
  const time = Math.max(0, Number(activityTime) || 0);
  if (speaking || reducedMotion) {
    return {
      scanX: 0,
      scanY: 0,
      pageTurn: 0,
      pageAngle: 0,
      pageCurl: 0,
      pageVisible: false,
    };
  }
  const lineDuration = 2.25;
  const line = Math.floor(time / lineDuration) % 4;
  const scan = (time % lineDuration) / lineDuration;
  const scanX = -.014 + scan * .028;
  const scanY = -line * .0055;
  const cycle = (time + 4.8) % 10.5;
  const duration = 1.25;
  const pageVisible = cycle < duration;
  const pageTurn = pageVisible ? clamp01(cycle / duration) : 0;
  const eased = pageTurn * pageTurn * (3 - 2 * pageTurn);
  const pageAngle = pageVisible ? -Math.PI * .72 * eased : 0;
  const pageCurl = pageVisible ? Math.sin(pageTurn * Math.PI) : 0;
  return { scanX, scanY, pageTurn, pageAngle, pageCurl, pageVisible };
}

export function clearMatthiasStrategyBookletRig(rig) {
  const activityRig = rig?.activityRig;
  if (!activityRig) return 0;
  elapsedSeconds(rig, {}, false);
  if (activityRig.strategyBookletPageTurnPivot) {
    activityRig.strategyBookletPageTurnPivot.visible = false;
    activityRig.strategyBookletPageTurnPivot.rotation.set(0, 0, 0);
  }
  rig.root.userData.activityStrategyBookletState = 'inactive';
  rig.root.userData.activityStrategyBookletHands = 'inactive';
  rig.root.userData.activityStrategyBookletPageTurn = 0;
  return 1;
}

export function applyMatthiasStrategyBookletRig(rig, pose = {}) {
  const activityRig = rig?.activityRig;
  if (!activityRig || rig.root?.userData?.activityProp !== 'book') {
    clearMatthiasStrategyBookletRig(rig);
    return null;
  }

  const book = buildBooklet(rig);
  if (!book) return null;
  const reducedMotion = Boolean(pose.activityReducedMotion);
  const speaking = Boolean(pose.activitySpeaking) || Number(pose.mouthOpen) >= .14;
  const time = elapsedSeconds(rig, pose, true);
  const reading = matthiasStrategyBookletReadingState(time, { speaking, reducedMotion });
  const yaw = Number(pose.headYaw) || 0;

  // Visual readability wins over nominal prop scale here. At the Home card's
  // real pixel size a 1.03x book still reads as a postcard. Keep the booklet
  // close to the face, clearly open and large enough that two pages survive
  // downsampling on desktop and Android.
  book.visible = true;
  book.position.set(-.012, -.205, 1.015);
  book.rotation.set(-.24, .025 + yaw * .06, .006 + Math.sin(time * .48) * (reducedMotion ? 0 : .003));
  book.scale.setScalar(1.55);

  if (activityRig.objectInteractionSurface) activityRig.objectInteractionSurface.visible = false;
  hideLegacyContactCuffs(activityRig);
  activityRig.support.visible = true;
  activityRig.assist.visible = true;

  const rightPage = activityRig.strategyBookletRightPage;
  const leftPage = activityRig.strategyBookletLeftPage;
  const supportTarget = localTarget(activityRig.root, rightPage, [.145, -.175, .062]);
  const assistTarget = localTarget(activityRig.root, leftPage, [-.145, -.175, .062]);
  const supportSolved = solveArm({
    owner: activityRig.root,
    stem: activityRig.supportStem,
    glove: activityRig.supportGlove,
    shoulder: [.34, -.30, .47],
    target: supportTarget,
  });
  const assistSolved = solveArm({
    owner: activityRig.root,
    stem: activityRig.assistStem,
    glove: activityRig.assistGlove,
    shoulder: [-.34, -.30, .47],
    target: assistTarget,
  });

  const pagePivot = activityRig.strategyBookletPageTurnPivot;
  if (pagePivot) {
    pagePivot.visible = reading.pageVisible;
    pagePivot.rotation.set(reading.pageCurl * .045, reading.pageAngle, -reading.pageCurl * .025);
  }

  if (!speaking) {
    if (rig.leftEye) {
      rig.leftEye.position.x += reading.scanX;
      rig.leftEye.position.y += reading.scanY - .026;
    }
    if (rig.rightEye) {
      rig.rightEye.position.x += reading.scanX;
      rig.rightEye.position.y += reading.scanY - .026;
    }
    if (rig.headPivot) {
      rig.headPivot.rotation.x += .155;
      rig.headPivot.rotation.y += yaw * .018;
    }
  }

  rig.root.userData.activityPropRelationship = 'handheld-reading';
  rig.root.userData.activityObjectStaging = 'held-open-booklet';
  rig.root.userData.activityPropContactHands = 'booklet:1/1';
  rig.root.userData.activityStrategyBookletState = 'reading';
  rig.root.userData.activityStrategyBookletHands = supportSolved && assistSolved ? 'two-hand-corners' : 'partial';
  rig.root.userData.activityStrategyBookletPageTurn = reading.pageTurn;
  rig.root.userData.activityStrategyBookletScan = `${reading.scanX.toFixed(3)},${reading.scanY.toFixed(3)}`;
  rig.root.userData.activityStrategyBookletVisualScale = book.scale.x;

  return {
    prop: 'book',
    staging: 'held-open-booklet',
    supportSolved,
    assistSolved,
    supportTarget,
    assistTarget,
    pageTurn: reading.pageTurn,
  };
}