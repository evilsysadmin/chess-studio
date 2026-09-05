import * as THREE from 'three';
import {
  applyMatthiasTacticalMeal,
  clearMatthiasTacticalMeal,
  MATTHIAS_TACTICAL_MEAL_RIG_VERSION,
} from './matthiasTacticalMealRig.js';
import {
  applyMatthiasHomeSleepRig,
  clearMatthiasHomeSleepRig,
  MATTHIAS_HOME_SLEEP_RIG_VERSION,
} from './matthiasHomeSleepRig.js';

export const MATTHIAS_HOME_PROP_ERGONOMICS_VERSION = 'home-props-v1-handheld';
export const MATTHIAS_CHESS_WEEKLY_RIG_VERSION = 'chess-weekly-v2-mock-fidelity';
export const MATTHIAS_WORK_FOCUS_FACE_VERSION = 'work-focus-v2-awake-approved-mock';
export const MATTHIAS_DOSSIER_MOCK_VERSION = 'dossier-desk-v1-approved-mock';

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

  const paper = new THREE.MeshStandardMaterial({ color: 0xe8dfca, roughness: .82, metalness: 0, side: THREE.DoubleSide });
  const paperEdge = new THREE.MeshStandardMaterial({ color: 0xc9bea8, roughness: .9, metalness: 0, side: THREE.DoubleSide });
  const ink = new THREE.MeshStandardMaterial({ color: 0x3d3b37, roughness: .9, metalness: 0, side: THREE.DoubleSide });
  const mutedRed = new THREE.MeshStandardMaterial({ color: 0x6f2b25, roughness: .72, metalness: .03, side: THREE.DoubleSide });
  const chessDark = new THREE.MeshStandardMaterial({ color: 0x55514a, roughness: .82, metalness: 0, side: THREE.DoubleSide });

  const leftPage = new THREE.Group();
  leftPage.name = 'chess-weekly-left-page';
  leftPage.position.x = -.185;
  leftPage.rotation.y = .24;
  leftPage.rotation.z = .018;
  press.add(leftPage);
  mesh(leftPage, new THREE.BoxGeometry(.37, .47, .018), paper, { name: 'chess-weekly-paper-left' });
  mesh(leftPage, new THREE.BoxGeometry(.27, .030, .010), mutedRed, { name: 'chess-weekly-masthead-left', position: [0, .185, .016] });
  addArticleLines(leftPage, ink, { x: -.055, y: .120, width: .22, count: 4, gap: .034 });
  mesh(leftPage, new THREE.BoxGeometry(.12, .105, .010), chessDark, { name: 'chess-weekly-photo-left', position: [.085, -.045, .017] });
  addArticleLines(leftPage, ink, { x: -.055, y: -.095, width: .22, count: 4, gap: .032 });

  const rightPage = new THREE.Group();
  rightPage.name = 'chess-weekly-right-page';
  rightPage.position.x = .185;
  rightPage.rotation.y = -.24;
  rightPage.rotation.z = -.018;
  press.add(rightPage);
  mesh(rightPage, new THREE.BoxGeometry(.37, .47, .018), paper, { name: 'chess-weekly-paper-right' });
  mesh(rightPage, new THREE.BoxGeometry(.29, .028, .010), mutedRed, { name: 'chess-weekly-masthead-right', position: [0, .185, .016] });
  addArticleLines(rightPage, ink, { x: 0, y: .132, width: .26, count: 3, gap: .034 });

  const board = new THREE.Group();
  board.name = 'chess-weekly-diagram';
  board.position.set(.045, -.035, .021);
  rightPage.add(board);
  mesh(board, new THREE.BoxGeometry(.205, .135, .010), paperEdge, { name: 'chess-weekly-diagram-field' });
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

  mesh(press, new THREE.BoxGeometry(.010, .44, .030), paperEdge, { name: 'chess-weekly-central-fold', position: [0, 0, -.004] });
  for (const offset of [0, .010, .020]) {
    mesh(press, new THREE.BoxGeometry(.35, .008, .010), paperEdge, {
      name: 'chess-weekly-page-edge',
      position: [.185, -.237 - offset * .35, -.010 - offset],
      rotation: [0, -.24, -.015],
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
  activityRig.pressLeftEyeBaseY = Number(rig.leftEye?.position?.y ?? .405);
  activityRig.pressRightEyeBaseY = Number(rig.rightEye?.position?.y ?? .405);
  return press;
}

function ensurePress(rig) {
  const activityRig = rig?.activityRig;
  if (!activityRig) return null;
  if (activityRig.press?.userData?.rigVersion === MATTHIAS_CHESS_WEEKLY_RIG_VERSION) return activityRig.press;
  if (activityRig.press) activityRig.root.remove(activityRig.press);
  return buildChessWeeklyPress(rig);
}

function buildDossierMock(rig) {
  const activityRig = rig?.activityRig;
  if (!activityRig) return null;

  const scene = new THREE.Group();
  scene.name = 'activity-dossier-mock';
  scene.visible = false;
  scene.userData.rigVersion = MATTHIAS_DOSSIER_MOCK_VERSION;
  activityRig.root.add(scene);

  const wood = new THREE.MeshStandardMaterial({ color: 0x2a1710, roughness: .62, metalness: .06 });
  const woodEdge = new THREE.MeshStandardMaterial({ color: 0x56301e, roughness: .48, metalness: .10 });
  const paper = new THREE.MeshStandardMaterial({ color: 0xd7c7a7, roughness: .76, metalness: 0, side: THREE.DoubleSide });
  const paperEdge = new THREE.MeshStandardMaterial({ color: 0xa9987c, roughness: .82, metalness: 0, side: THREE.DoubleSide });
  const ink = new THREE.MeshStandardMaterial({ color: 0x27221c, roughness: .88, metalness: 0 });
  const black = new THREE.MeshStandardMaterial({ color: 0x090b0e, roughness: .28, metalness: .48 });
  const mutedRed = new THREE.MeshStandardMaterial({ color: 0x6f211d, roughness: .42, metalness: .12 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd09b37, roughness: .22, metalness: .92 });

  // Copy of the approved mock: a low dark desk, three books on the left,
  // campaign mug on the right and an open dossier held in the middle.
  mesh(scene, new THREE.BoxGeometry(1.42, .105, .30), wood, { name: 'dossier-mock-desk', position: [0, -.735, .585] });
  mesh(scene, new THREE.BoxGeometry(1.46, .035, .325), woodEdge, { name: 'dossier-mock-desk-edge', position: [0, -.676, .598] });

  const books = new THREE.Group();
  books.name = 'dossier-mock-books';
  scene.add(books);
  for (const [index, y] of [[0, -.625], [1, -.565], [2, -.505]]) {
    mesh(books, new THREE.BoxGeometry(.34, .052, .20), index === 1 ? mutedRed : black, {
      name: 'dossier-mock-book',
      position: [-.48, y, .73],
      rotation: [0, -.05 + index * .025, -.015 + index * .012],
    });
    mesh(books, new THREE.BoxGeometry(.30, .010, .206), gold, {
      name: 'dossier-mock-book-gilt',
      position: [-.48, y + .027, .732],
      rotation: [0, -.05 + index * .025, -.015 + index * .012],
    });
  }

  const mug = new THREE.Group();
  mug.name = 'dossier-mock-mug';
  mug.position.set(.52, -.555, .75);
  scene.add(mug);
  mesh(mug, new THREE.CylinderGeometry(.085, .078, .20, 22), black, { name: 'dossier-mock-mug-body' });
  mesh(mug, new THREE.TorusGeometry(.083, .008, 7, 22), gold, {
    name: 'dossier-mock-mug-rim',
    position: [0, .10, 0],
    rotation: [Math.PI / 2, 0, 0],
  });
  mesh(mug, new THREE.TorusGeometry(.060, .014, 7, 18, Math.PI * 1.58), gold, {
    name: 'dossier-mock-mug-handle',
    position: [.088, -.005, 0],
    rotation: [0, Math.PI / 2, -.30],
  });
  mesh(mug, new THREE.CircleGeometry(.032, 16), gold, {
    name: 'dossier-mock-mug-pawn-badge',
    position: [0, .005, .082],
  });

  const document = new THREE.Group();
  document.name = 'dossier-mock-open-file';
  document.position.set(.03, -.43, .84);
  document.rotation.x = -.20;
  scene.add(document);

  mesh(document, new THREE.BoxGeometry(.33, .37, .024), mutedRed, {
    name: 'dossier-mock-cover-left',
    position: [-.155, -.010, -.018],
    rotation: [0, .18, .025],
  });
  mesh(document, new THREE.BoxGeometry(.33, .37, .024), mutedRed, {
    name: 'dossier-mock-cover-right',
    position: [.155, -.010, -.018],
    rotation: [0, -.18, -.025],
  });
  const leftPage = mesh(document, new THREE.BoxGeometry(.30, .34, .018), paper, {
    name: 'dossier-mock-page-left',
    position: [-.145, .012, .010],
    rotation: [0, .20, .020],
  });
  const rightPage = mesh(document, new THREE.BoxGeometry(.30, .34, .018), paper, {
    name: 'dossier-mock-page-right',
    position: [.145, .012, .010],
    rotation: [0, -.20, -.020],
  });
  mesh(document, new THREE.BoxGeometry(.018, .33, .026), paperEdge, {
    name: 'dossier-mock-fold',
    position: [0, .012, .025],
  });
  mesh(rightPage, new THREE.BoxGeometry(.15, .022, .010), gold, {
    name: 'dossier-mock-classified-bar',
    position: [-.015, .105, .018],
  });
  for (const [page, x] of [[leftPage, -.02], [rightPage, .015]]) {
    for (let row = 0; row < 4; row += 1) {
      mesh(page, new THREE.BoxGeometry(.18 - (row % 3) * .018, .010, .008), ink, {
        name: 'dossier-mock-report-line',
        position: [x, .055 - row * .050, .018],
      });
    }
  }

  activityRig.dossierMock = scene;
  rig.root.userData.activityDossierMockVersion = MATTHIAS_DOSSIER_MOCK_VERSION;
  return scene;
}

function ensureDossierMock(rig) {
  const activityRig = rig?.activityRig;
  if (!activityRig) return null;
  if (activityRig.dossierMock?.userData?.rigVersion === MATTHIAS_DOSSIER_MOCK_VERSION) return activityRig.dossierMock;
  if (activityRig.dossierMock) activityRig.root.remove(activityRig.dossierMock);
  return buildDossierMock(rig);
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
  const now = typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() / 1000 : Date.now() / 1000;
  const startedAt = PRESS_CLOCKS.get(rig);
  if (!Number.isFinite(startedAt)) {
    PRESS_CLOCKS.set(rig, now);
    return 0;
  }
  return Math.max(0, now - startedAt);
}

export function matthiasChessWeeklyReadingState(activityTime = 0, { speaking = false, reducedMotion = false } = {}) {
  const time = Math.max(0, Number(activityTime) || 0);
  if (speaking || reducedMotion) {
    return { readingLine: 0, readingScan: .5, eyeX: 0, eyeY: 0, pageTurn: 0, pageAngle: 0, pageCurl: 0, pageVisible: false };
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
  return { readingLine, readingScan, eyeX, eyeY, pageTurn, pageAngle, pageCurl, pageVisible };
}

export function matthiasHomeErgonomicActivityProp(profile = '', baseProp = 'none') {
  return normalizedProfile(profile) === 'press' ? 'press' : baseProp;
}

function restorePressEyeHeight(rig, activityRig) {
  if (rig.leftEye && Number.isFinite(activityRig.pressLeftEyeBaseY)) rig.leftEye.position.y = activityRig.pressLeftEyeBaseY;
  if (rig.rightEye && Number.isFinite(activityRig.pressRightEyeBaseY)) rig.rightEye.position.y = activityRig.pressRightEyeBaseY;
}
function applyMatthiasWorkFocusFace(rig, pose, { headPitch = .040, yawBias = 0 } = {}) {
  if (!rig?.leftEye || !rig?.rightEye) return;
  const speaking = Boolean(pose.activitySpeaking) || Number(pose.mouthOpen) >= .14;
  if (speaking) return;
  rig.leftEye.position.z = Math.max(.625, rig.leftEye.position.z);
  rig.rightEye.position.z = Math.max(.625, rig.rightEye.position.z);
  rig.leftEye.scale.x = .86;
  rig.rightEye.scale.x = .86;
  rig.leftEye.scale.y = Math.max(1.44, rig.leftEye.scale.y);
  rig.rightEye.scale.y = Math.max(1.44, rig.rightEye.scale.y);
  rig.leftBrow.rotation.z = Math.PI / 2 - .30;
  rig.rightBrow.rotation.z = Math.PI / 2 + .34;
  rig.leftBrow.position.y = rig.base.leftBrowY - .008;
  rig.rightBrow.position.y = rig.base.rightBrowY - .002;
  rig.headPivot.rotation.x += headPitch;
  rig.headPivot.rotation.y += yawBias;
  rig.root.userData.activityWorkFace = MATTHIAS_WORK_FOCUS_FACE_VERSION;
}

function applyChessWeeklyFocusFace(rig, activityRig, pose, reading, speaking) {
  if (!rig.leftEye || !rig.rightEye) return;
  const gazeX = Number(pose.gazeX) || 0;
  const leftBaseY = Number.isFinite(activityRig.pressLeftEyeBaseY) ? activityRig.pressLeftEyeBaseY : rig.leftEye.position.y;
  const rightBaseY = Number.isFinite(activityRig.pressRightEyeBaseY) ? activityRig.pressRightEyeBaseY : rig.rightEye.position.y;
  rig.leftEye.position.x = rig.base.leftEyeX + gazeX + (speaking ? 0 : reading.eyeX);
  rig.rightEye.position.x = rig.base.rightEyeX + gazeX + (speaking ? 0 : reading.eyeX);
  rig.leftEye.position.y = leftBaseY + (speaking ? 0 : reading.eyeY);
  rig.rightEye.position.y = rightBaseY + (speaking ? 0 : reading.eyeY);
  if (speaking) return;
  rig.leftEye.position.z = Math.max(.625, rig.leftEye.position.z);
  rig.rightEye.position.z = Math.max(.625, rig.rightEye.position.z);
  rig.leftEye.scale.x = .86;
  rig.rightEye.scale.x = .86;
  rig.leftEye.scale.y = Math.max(1.44, rig.leftEye.scale.y);
  rig.rightEye.scale.y = Math.max(1.44, rig.rightEye.scale.y);
  rig.leftBrow.rotation.z = Math.PI / 2 - .30;
  rig.rightBrow.rotation.z = Math.PI / 2 + .34;
  rig.leftBrow.position.y = rig.base.leftBrowY - .008;
  rig.rightBrow.position.y = rig.base.rightBrowY - .002;
  rig.mouthGroup.rotation.z = -.018;
  rig.mouthGroup.scale.x = .90;
  rig.headPivot.rotation.y -= .025;
  rig.headPivot.rotation.x += .055;
  rig.root.userData.activityWorkFace = MATTHIAS_WORK_FOCUS_FACE_VERSION;
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
  const dossierMock = prop === 'dossier' ? ensureDossierMock(rig) : activityRig.dossierMock;

  if (press) press.visible = prop === 'press';
  if (dossierMock) dossierMock.visible = prop === 'dossier';
  if (prop !== 'press') restorePressEyeHeight(rig, activityRig);
  if (prop !== 'ration') clearMatthiasTacticalMeal(rig);
  if (prop !== 'blanket') clearMatthiasHomeSleepRig(rig);
  if (!['book', 'dossier', 'write', 'press'].includes(prop)) rig.root.userData.activityWorkFace = 'inactive';

  const { cup, beer, breakfast, ration, book, dossier, write, chess, blanket, support, supportStem, supportGlove, assist, assistStem, assistGlove } = activityRig;

  if (prop === 'cup') {
    setPose(cup, [.50 - reach * .18, -.34 + reach * .46, .76], [.08 + reach * .08, -.14, -.16], .82);
    support.visible = true; assist.visible = false;
    setLimb(supportStem, supportGlove, [.39 - reach * .04, -.34 + reach * .18, .47], -.58 - reach * .10, [cup.position.x + .10, cup.position.y - .02, .72]);
  } else if (prop === 'beer') {
    setPose(beer, [.49 - reach * .16, -.37 + reach * .40, .76], [.08 + reach * .06, -.16, -.14], .86);
    support.visible = true; assist.visible = false;
    setLimb(supportStem, supportGlove, [.39 - reach * .03, -.36 + reach * .16, .47], -.60 - reach * .08, [beer.position.x + .11, beer.position.y - .03, .72]);
  } else if (prop === 'breakfast') {
    setPose(breakfast, [.15, -.66 + reach * .04, .75], [-.48, -.08, -.06], .76);
    setPose(cup, [-.16, -.58 + reach * .06, .77], [.08, .08, .05], .68);
    support.visible = true; assist.visible = true;
    setLimb(supportStem, supportGlove, [.34, -.45, .48], -.58, [.34, -.47, .70]);
    setLimb(assistStem, assistGlove, [-.34, -.45, .47], .58, [-.22, -.47, .70]);
  } else if (prop === 'ration') {
    const meal = applyMatthiasTacticalMeal(rig, { ...pose, reach });
    rig.root.userData.activityMealRigVersion = MATTHIAS_TACTICAL_MEAL_RIG_VERSION;
    if (!meal) {
      setPose(ration, [.25, -.64 + reach * .06, .75], [-.46 + reach * .04, -.12, -.10], .86);
      support.visible = true; assist.visible = true;
      setLimb(supportStem, supportGlove, [.36, -.44, .48], -.56, [.39, -.45, .70]);
      setLimb(assistStem, assistGlove, [-.27, -.44, .47], .66, [.02, -.46, .69]);
    }
  } else if (prop === 'book') {
    setPose(book, [-.14, -.57 + reach * .05, .78], [-.50, .18 + yaw * .28, .07], .86);
    support.visible = true; assist.visible = true;
    setLimb(supportStem, supportGlove, [.31, -.39, .48], -.66, [.16, -.40, .71]);
    setLimb(assistStem, assistGlove, [-.34, -.39, .47], .62, [-.38, -.40, .70]);
    applyMatthiasWorkFocusFace(rig, pose, { headPitch: .050, yawBias: -.012 });
  } else if (prop === 'dossier') {
    // Exact approved composition, not an interpretation: open expediente in both
    // hands, books left, campaign mug right, low desk, visible awake eyes.
    dossier.visible = false;
    if (dossierMock) setPose(dossierMock, [0, 0, 0], [0, 0, 0], 1);
    support.visible = true; assist.visible = true;
    setLimb(supportStem, supportGlove, [.30, -.38, .48], -.48, [.27, -.39, .73]);
    setLimb(assistStem, assistGlove, [-.30, -.38, .47], .48, [-.25, -.39, .72]);
    applyMatthiasWorkFocusFace(rig, pose, { headPitch: .018, yawBias: 0 });
    rig.root.userData.activityDossierComposition = MATTHIAS_DOSSIER_MOCK_VERSION;
  } else if (prop === 'write') {
    setPose(write, [.20, -.64 + reach * .04, .76], [-.58, -.24 + yaw * .12, -.12], .80);
    support.visible = true; assist.visible = true;
    setLimb(supportStem, supportGlove, [.34, -.39, .48], -.68, [.35, -.43, .72]);
    setLimb(assistStem, assistGlove, [-.29, -.42, .47], .66, [-.02, -.45, .69]);
    applyMatthiasWorkFocusFace(rig, pose, { headPitch: .055, yawBias: .008 });
  } else if (prop === 'chess') {
    setPose(chess, [.25, -.72 + reach * .03, .79], [-.66, -.08 + yaw * .06, -.11], .80);
    support.visible = true; assist.visible = false;
    setLimb(supportStem, supportGlove, [.37, -.42, .48], -.72, [.39, -.38, .72]);
  } else if (prop === 'press' && press) {
    const activityTime = activityElapsedSeconds(rig, pose, true);
    const speaking = Boolean(pose.activitySpeaking) || Number(pose.mouthOpen) >= .14;
    const reading = matthiasChessWeeklyReadingState(activityTime, { speaking, reducedMotion: Boolean(pose.activityReducedMotion) });
    setPose(press, [-.045, -.300 + reach * .018, .865], [-.075, .12 + yaw * .10, .018], 1.20);
    press.position.y += Math.sin(activityTime * .72) * .003;
    press.rotation.z += Math.sin(activityTime * .56) * .005;
    support.visible = true; assist.visible = true;
    setLimb(supportStem, supportGlove, [.36, -.31, .48], -.72, [.465, -.335, .755]);
    setLimb(assistStem, assistGlove, [-.36, -.31, .47], .72, [-.475, -.335, .745]);
    const pagePivot = activityRig.pressPageTurnPivot;
    if (pagePivot) {
      pagePivot.visible = reading.pageVisible;
      pagePivot.rotation.set(reading.pageCurl * .055, reading.pageAngle, -reading.pageCurl * .035);
    }
    applyChessWeeklyFocusFace(rig, activityRig, pose, reading, speaking);
    rig.root.userData.activityReadingLine = reading.readingLine;
    rig.root.userData.activityReadingScan = reading.readingScan;
    rig.root.userData.activityPageTurn = reading.pageTurn;
    rig.root.userData.activityPressRigVersion = MATTHIAS_CHESS_WEEKLY_RIG_VERSION;
    rig.root.userData.activityPressComposition = 'mock-reading-v2';
  } else if (prop === 'blanket') {
    support.visible = false;
    assist.visible = false;
    applyMatthiasHomeSleepRig(rig, { ...pose, reach });
    rig.root.userData.activitySleepRigVersion = MATTHIAS_HOME_SLEEP_RIG_VERSION;
  }

  if (prop !== 'dossier') rig.root.userData.activityDossierComposition = 'inactive';

  if (prop !== 'press') {
    activityElapsedSeconds(rig, pose, false);
    rig.root.userData.activityReadingLine = -1;
    rig.root.userData.activityReadingScan = 0;
    rig.root.userData.activityPageTurn = 0;
    rig.root.userData.activityPressComposition = 'inactive';
  }

  activityRig.currentProp = prop;
  rig.root.userData.activityProp = prop;
  rig.root.userData.activityErgonomicsVersion = MATTHIAS_HOME_PROP_ERGONOMICS_VERSION;
  return prop;
}
