import * as THREE from 'three';

export const MATTHIAS_HOME_PROP_ERGONOMICS_VERSION = 'home-props-v1-handheld';
export const MATTHIAS_CHESS_WEEKLY_RIG_VERSION = 'chess-weekly-v1-articulated';

const PRESS_CLOCKS = new WeakMap();

function normalizedProfile(value = '') {
  return String(value || '').trim().toLowerCase();
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function setScalar(group, value) {
  group?.scale?.setScalar?.(value);
}

function setPose(group, position, rotation, scale = 1) {
  if (!group) return;
  group.position.set(...position);
  group.rotation.set(...rotation);
  setScalar(group, scale);
}

function setLimb(stem, glove, stemPosition, stemRotationZ, glovePosition) {
  if (!stem || !glove) return;
  stem.position.set(...stemPosition);
  stem.rotation.z = stemRotationZ;
  glove.position.set(...glovePosition);
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
  parent.add(next);
  return next;
}

function addArticleLines(parent, material, {
  x = 0,
  y = 0,
  width = .24,
  count = 5,
  gap = .036,
  z = .017,
} = {}) {
  for (let index = 0; index < count; index += 1) {
    const shrink = index % 3 === 2 ? .82 : 1;
    mesh(parent, new THREE.BoxGeometry(width * shrink, .010, .009), material, {
      name: 'chess-weekly-copy-line',
      position: [x, y - index * gap, z],
    });
  }
}

function buildChessWeeklyPress(rig) {
  const activityRig = rig?.activityRig;
  if (!activityRig) return null;

  const press = new THREE.Group();
  press.name = 'activity-press';
  press.visible = false;
  press.userData.rigVersion = MATTHIAS_CHESS_WEEKLY_RIG_VERSION;
  activityRig.root.add(press);

  const paper = new THREE.MeshStandardMaterial({
    color: 0xe8dfca,
    roughness: .82,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const paperEdge = new THREE.MeshStandardMaterial({
    color: 0xc9bea8,
    roughness: .9,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const ink = new THREE.MeshStandardMaterial({
    color: 0x3d3b37,
    roughness: .9,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const mutedRed = new THREE.MeshStandardMaterial({
    color: 0x6f2b25,
    roughness: .72,
    metalness: .03,
    side: THREE.DoubleSide,
  });
  const chessDark = new THREE.MeshStandardMaterial({
    color: 0x55514a,
    roughness: .82,
    metalness: 0,
    side: THREE.DoubleSide,
  });

  const leftPage = new THREE.Group();
  leftPage.name = 'chess-weekly-left-page';
  leftPage.position.x = -.185;
  leftPage.rotation.y = .105;
  leftPage.rotation.z = .018;
  press.add(leftPage);
  mesh(leftPage, new THREE.BoxGeometry(.37, .47, .018), paper, {
    name: 'chess-weekly-paper-left',
  });
  mesh(leftPage, new THREE.BoxGeometry(.27, .030, .010), mutedRed, {
    name: 'chess-weekly-masthead-left',
    position: [0, .185, .016],
  });
  addArticleLines(leftPage, ink, { x: -.055, y: .120, width: .22, count: 4, gap: .034 });
  mesh(leftPage, new THREE.BoxGeometry(.12, .105, .010), chessDark, {
    name: 'chess-weekly-photo-left',
    position: [.085, -.045, .017],
  });
  addArticleLines(leftPage, ink, { x: -.055, y: -.095, width: .22, count: 4, gap: .032 });

  const rightPage = new THREE.Group();
  rightPage.name = 'chess-weekly-right-page';
  rightPage.position.x = .185;
  rightPage.rotation.y = -.105;
  rightPage.rotation.z = -.018;
  press.add(rightPage);
  mesh(rightPage, new THREE.BoxGeometry(.37, .47, .018), paper, {
    name: 'chess-weekly-paper-right',
  });
  mesh(rightPage, new THREE.BoxGeometry(.29, .028, .010), mutedRed, {
    name: 'chess-weekly-masthead-right',
    position: [0, .185, .016],
  });
  addArticleLines(rightPage, ink, { x: 0, y: .132, width: .26, count: 3, gap: .034 });

  const board = new THREE.Group();
  board.name = 'chess-weekly-diagram';
  board.position.set(.045, -.035, .021);
  rightPage.add(board);
  mesh(board, new THREE.BoxGeometry(.205, .135, .010), paperEdge, {
    name: 'chess-weekly-diagram-field',
  });
  const squareW = .051;
  const squareH = .034;
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      if ((row + column) % 2 === 0) continue;
      mesh(board, new THREE.BoxGeometry(squareW * .92, squareH * .92, .008), chessDark, {
        name: 'chess-weekly-diagram-dark-square',
        position: [(column - 1.5) * squareW, (row - 1.5) * squareH, .010],
      });
    }
  }
  addArticleLines(rightPage, ink, { x: -.035, y: -.135, width: .24, count: 3, gap: .031 });

  mesh(press, new THREE.BoxGeometry(.010, .44, .030), paperEdge, {
    name: 'chess-weekly-central-fold',
    position: [0, 0, -.004],
  });
  for (const offset of [0, .010, .020]) {
    mesh(press, new THREE.BoxGeometry(.35, .008, .010), paperEdge, {
      name: 'chess-weekly-page-edge',
      position: [.185, -.237 - offset * .35, -.010 - offset],
      rotation: [0, -.10, -.015],
    });
  }

  const pageTurnPivot = new THREE.Group();
  pageTurnPivot.name = 'chess-weekly-page-turn-pivot';
  pageTurnPivot.position.set(0, 0, .040);
  press.add(pageTurnPivot);
  const pageTurnLeaf = mesh(pageTurnPivot, new THREE.BoxGeometry(.355, .455, .012), paper, {
    name: 'chess-weekly-page-turn-leaf',
    position: [.1775, 0, 0],
  });
  mesh(pageTurnPivot, new THREE.BoxGeometry(.255, .026, .010), mutedRed, {
    name: 'chess-weekly-page-turn-masthead',
    position: [.18, .180, .010],
  });
  addArticleLines(pageTurnPivot, ink, { x: .18, y: .125, width: .245, count: 6, gap: .035, z: .012 });

  activityRig.press = press;
  activityRig.pressPageTurnPivot = pageTurnPivot;
  activityRig.pressPageTurnLeaf = pageTurnLeaf;
  activityRig.pressRigVersion = MATTHIAS_CHESS_WEEKLY_RIG_VERSION;
  return press;
}

function ensurePress(rig) {
  const activityRig = rig?.activityRig;
  if (!activityRig) return null;
  if (activityRig.press?.userData?.rigVersion === MATTHIAS_CHESS_WEEKLY_RIG_VERSION) {
    return activityRig.press;
  }
  if (activityRig.press) activityRig.root.remove(activityRig.press);
  return buildChessWeeklyPress(rig);
}

function smoothstep01(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function activityElapsedSeconds(rig, pose, active) {
  const explicit = Number(pose?.activityTime);
  if (Number.isFinite(explicit)) return Math.max(0, explicit);
  if (!active) {
    PRESS_CLOCKS.delete(rig);
    return 0;
  }
  const now = typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now() / 1000
    : Date.now() / 1000;
  const startedAt = PRESS_CLOCKS.get(rig);
  if (!Number.isFinite(startedAt)) {
    PRESS_CLOCKS.set(rig, now);
    return 0;
  }
  return Math.max(0, now - startedAt);
}

export function matthiasChessWeeklyReadingState(activityTime = 0, {
  speaking = false,
  reducedMotion = false,
} = {}) {
  const time = Math.max(0, Number(activityTime) || 0);
  if (speaking || reducedMotion) {
    return {
      readingLine: 0,
      readingScan: .5,
      eyeX: 0,
      eyeY: 0,
      pageTurn: 0,
      pageAngle: 0,
      pageCurl: 0,
      pageVisible: false,
    };
  }

  const lineDuration = 1.85;
  const readingLine = Math.floor(time / lineDuration) % 4;
  const readingScan = (time % lineDuration) / lineDuration;
  const eyeX = -.020 + readingScan * .040;
  const eyeY = -readingLine * .0075;

  const pageCycle = (time + 8.4) % 12;
  const pageDuration = 1.50;
  const pageVisible = pageCycle < pageDuration;
  const pageTurn = pageVisible ? smoothstep01(pageCycle / pageDuration) : 0;
  const pageAngle = pageVisible ? -Math.PI * .92 * pageTurn : 0;
  const pageCurl = pageVisible ? Math.sin(pageTurn * Math.PI) : 0;

  return {
    readingLine,
    readingScan,
    eyeX,
    eyeY,
    pageTurn,
    pageAngle,
    pageCurl,
    pageVisible,
  };
}

export function matthiasHomeErgonomicActivityProp(profile = '', baseProp = 'none') {
  return normalizedProfile(profile) === 'press' ? 'press' : baseProp;
}

export function applyMatthiasHomePropErgonomics(rig, pose = {}) {
  const activityRig = rig?.activityRig;
  if (!activityRig) return 'none';

  const profile = normalizedProfile(pose.activityProfile);
  const baseProp = String(rig.root?.userData?.activityProp || 'none');
  const prop = matthiasHomeErgonomicActivityProp(profile, baseProp);
  const reach = clamp01(rig.root?.userData?.activityReach ?? pose.reach);
  const yaw = Number(pose.headYaw) || 0;
  const press = prop === 'press' ? ensurePress(rig) : activityRig.press;

  if (press) press.visible = prop === 'press';

  const {
    cup,
    beer,
    breakfast,
    ration,
    book,
    dossier,
    write,
    chess,
    blanket,
    support,
    supportStem,
    supportGlove,
    assist,
    assistStem,
    assistGlove,
  } = activityRig;

  if (prop === 'cup') {
    setPose(cup, [.50 - reach * .18, -.34 + reach * .46, .76], [.08 + reach * .08, -.14, -.16], .82);
    support.visible = true;
    assist.visible = false;
    setLimb(supportStem, supportGlove, [.39 - reach * .04, -.34 + reach * .18, .47], -.58 - reach * .10, [cup.position.x + .10, cup.position.y - .02, .72]);
  } else if (prop === 'beer') {
    setPose(beer, [.49 - reach * .16, -.37 + reach * .40, .76], [.08 + reach * .06, -.16, -.14], .86);
    support.visible = true;
    assist.visible = false;
    setLimb(supportStem, supportGlove, [.39 - reach * .03, -.36 + reach * .16, .47], -.60 - reach * .08, [beer.position.x + .11, beer.position.y - .03, .72]);
  } else if (prop === 'breakfast') {
    setPose(breakfast, [.15, -.66 + reach * .04, .75], [-.48, -.08, -.06], .76);
    setPose(cup, [-.16, -.58 + reach * .06, .77], [.08, .08, .05], .68);
    support.visible = true;
    assist.visible = true;
    setLimb(supportStem, supportGlove, [.34, -.45, .48], -.58, [.34, -.47, .70]);
    setLimb(assistStem, assistGlove, [-.34, -.45, .47], .58, [-.22, -.47, .70]);
  } else if (prop === 'ration') {
    setPose(ration, [.25, -.64 + reach * .06, .75], [-.46 + reach * .04, -.12, -.10], .86);
    support.visible = true;
    assist.visible = true;
    setLimb(supportStem, supportGlove, [.36, -.44, .48], -.56, [.39, -.45, .70]);
    setLimb(assistStem, assistGlove, [-.27, -.44, .47], .66, [.02, -.46, .69]);
  } else if (prop === 'book') {
    setPose(book, [-.14, -.57 + reach * .05, .78], [-.50, .18 + yaw * .28, .07], .86);
    support.visible = true;
    assist.visible = true;
    setLimb(supportStem, supportGlove, [.31, -.39, .48], -.66, [.16, -.40, .71]);
    setLimb(assistStem, assistGlove, [-.34, -.39, .47], .62, [-.38, -.40, .70]);
  } else if (prop === 'dossier') {
    setPose(dossier, [.27, -.60 + reach * .04, .77], [-.44, -.34 + yaw * .18, -.15], .84);
    support.visible = true;
    assist.visible = true;
    setLimb(supportStem, supportGlove, [.35, -.40, .48], -.61, [.43, -.42, .71]);
    setLimb(assistStem, assistGlove, [-.25, -.36, .47], .76, [.08, -.34, .72]);
  } else if (prop === 'write') {
    setPose(write, [.20, -.64 + reach * .04, .76], [-.58, -.24 + yaw * .12, -.12], .80);
    support.visible = true;
    assist.visible = true;
    setLimb(supportStem, supportGlove, [.34, -.39, .48], -.68, [.35, -.43, .72]);
    setLimb(assistStem, assistGlove, [-.29, -.42, .47], .66, [-.02, -.45, .69]);
  } else if (prop === 'chess') {
    setPose(chess, [.25, -.72 + reach * .03, .79], [-.66, -.08 + yaw * .06, -.11], .80);
    support.visible = true;
    assist.visible = false;
    setLimb(supportStem, supportGlove, [.37, -.42, .48], -.72, [.39, -.38, .72]);
  } else if (prop === 'press' && press) {
    const activityTime = activityElapsedSeconds(rig, pose, true);
    const speaking = Boolean(pose.activitySpeaking) || Number(pose.mouthOpen) >= .14;
    const reading = matthiasChessWeeklyReadingState(activityTime, {
      speaking,
      reducedMotion: Boolean(pose.activityReducedMotion),
    });

    setPose(press, [-.035, -.405 + reach * .025, .835], [-.18, .16 + yaw * .16, .028], .94);
    press.position.y += Math.sin(activityTime * .72) * .004;
    press.rotation.z += Math.sin(activityTime * .56) * .007;
    support.visible = true;
    assist.visible = true;
    setLimb(supportStem, supportGlove, [.33, -.35, .48], -.67, [.35, -.405, .735]);
    setLimb(assistStem, assistGlove, [-.33, -.35, .47], .67, [-.36, -.405, .725]);

    const pagePivot = activityRig.pressPageTurnPivot;
    if (pagePivot) {
      pagePivot.visible = reading.pageVisible;
      pagePivot.rotation.set(reading.pageCurl * .055, reading.pageAngle, -reading.pageCurl * .035);
    }

    if (!speaking) {
      if (rig.leftEye) {
        rig.leftEye.position.x += reading.eyeX;
        rig.leftEye.position.y += reading.eyeY;
      }
      if (rig.rightEye) {
        rig.rightEye.position.x += reading.eyeX;
        rig.rightEye.position.y += reading.eyeY;
      }
      if (rig.headPivot) {
        rig.headPivot.rotation.y -= .065;
        rig.headPivot.rotation.x += .030;
      }
    }

    rig.root.userData.activityReadingLine = reading.readingLine;
    rig.root.userData.activityReadingScan = reading.readingScan;
    rig.root.userData.activityPageTurn = reading.pageTurn;
    rig.root.userData.activityPressRigVersion = MATTHIAS_CHESS_WEEKLY_RIG_VERSION;
  } else if (prop === 'blanket') {
    support.visible = false;
    assist.visible = false;
    setScalar(blanket, 1);
  }

  if (prop !== 'press') {
    activityElapsedSeconds(rig, pose, false);
    rig.root.userData.activityReadingLine = -1;
    rig.root.userData.activityReadingScan = 0;
    rig.root.userData.activityPageTurn = 0;
  }

  activityRig.currentProp = prop;
  rig.root.userData.activityProp = prop;
  rig.root.userData.activityErgonomicsVersion = MATTHIAS_HOME_PROP_ERGONOMICS_VERSION;
  return prop;
}
