import * as THREE from 'three';

export const MATTHIAS_HOME_SLEEP_RIG_VERSION = 'home-sleep-v3-horizontal-mock';
export const MATTHIAS_HOME_SLEEP_COMPOSITION = 'approved-horizontal-side-rest-v3';
export const MATTHIAS_HOME_SLEEP_REFERENCE = 'approved-home-sleep-horizontal-mock-v1';

const SLEEP_CLOCKS = new WeakMap();

function normalizedProfile(value = '') {
  return String(value || '').trim().toLowerCase();
}

function sleepMaterial(color, {
  metalness = 0,
  roughness = .86,
  clearcoat = 0,
} = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness,
    roughness,
    clearcoat,
    clearcoatRoughness: .35,
    side: THREE.DoubleSide,
  });
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

function compactSegments(rig, compactValue, fullValue) {
  return rig?.root?.userData?.renderTier === 'compact' ? compactValue : fullValue;
}

function blanketGeometry(compact = false) {
  const shape = new THREE.Shape();
  // Keep the cloth subordinate to Matthias. In the canonical horizontal pose it
  // covers the lower/right half of the pawn and never replaces his silhouette.
  shape.moveTo(-.50, .13);
  shape.quadraticCurveTo(-.57, .07, -.53, -.04);
  shape.lineTo(-.46, -.24);
  shape.quadraticCurveTo(-.22, -.30, .02, -.29);
  shape.quadraticCurveTo(.27, -.30, .47, -.23);
  shape.lineTo(.53, -.03);
  shape.quadraticCurveTo(.56, .07, .48, .13);
  shape.quadraticCurveTo(.23, .10, 0, .075);
  shape.quadraticCurveTo(-.24, .10, -.50, .13);
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: .075,
    curveSegments: compact ? 4 : 8,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: compact ? 1 : 2,
    bevelSize: .022,
    bevelThickness: .017,
  });
  geometry.center();
  return geometry;
}

function sleepElapsedSeconds(rig, pose, active) {
  const explicit = Number(pose?.activityTime);
  if (Number.isFinite(explicit)) return Math.max(0, explicit);
  if (!active) {
    SLEEP_CLOCKS.delete(rig);
    return 0;
  }
  const now = typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now() / 1000
    : Date.now() / 1000;
  const startedAt = SLEEP_CLOCKS.get(rig);
  if (!Number.isFinite(startedAt)) {
    SLEEP_CLOCKS.set(rig, now);
    return 0;
  }
  return Math.max(0, now - startedAt);
}

function coldShiver(elapsed) {
  // One brief involuntary shiver every ~13 seconds. Matthias is cold, not tied
  // to a washing machine on spin cycle.
  const period = 13.2;
  const start = 9.4;
  const duration = .72;
  const local = ((elapsed % period) + period) % period;
  if (local < start || local > start + duration) return 0;
  const progress = (local - start) / duration;
  const envelope = Math.sin(progress * Math.PI);
  return envelope * Math.sin(progress * Math.PI * 7);
}

function rememberCanonicalPose(rig) {
  const activityRig = rig?.activityRig;
  if (!activityRig || activityRig.sleepCanonicalPose) return;
  activityRig.sleepCanonicalPose = {
    headX: Number(rig.headPivot?.position?.x) || 0,
    mouthY: Number(rig.mouthGroup?.position?.y) || Number(rig.base?.mouthY) || 0,
    mouthScale: rig.mouthGroup?.scale?.clone?.() || new THREE.Vector3(1, 1, 1),
  };
}

function buildSleepRig(rig) {
  const activityRig = rig?.activityRig;
  if (!activityRig) return null;
  if (activityRig.premiumSleep?.userData?.rigVersion === MATTHIAS_HOME_SLEEP_RIG_VERSION) {
    return activityRig.premiumSleep;
  }
  if (activityRig.premiumSleep) activityRig.root.remove(activityRig.premiumSleep);

  const compact = Boolean(rig?.root?.userData?.compact);
  const cloth = sleepMaterial(0x241719, { roughness: .93 });
  const clothShadow = sleepMaterial(0x160f11, { roughness: .96 });
  const seam = sleepMaterial(0x685346, { roughness: .88 });
  const pillow = sleepMaterial(0x17191d, { roughness: .88 });
  const pillowEdge = sleepMaterial(0x342d27, { roughness: .90 });

  const root = new THREE.Group();
  root.name = 'premium-sleep-rig';
  root.visible = false;
  root.userData.rigVersion = MATTHIAS_HOME_SLEEP_RIG_VERSION;
  activityRig.root.add(root);

  // Low dark blanket over the lower body. Because the whole pawn lies on a true
  // horizontal axis, negative local Y becomes the right-hand/body end on screen.
  mesh(root, new THREE.SphereGeometry(
    .44,
    compactSegments(rig, 18, 30),
    compactSegments(rig, 12, 20),
  ), clothShadow, {
    name: 'sleep-blanket-underfold',
    position: [-.02, -.35, -.055],
    scale: [1.08, .34, .30],
    rotation: [0, -.04, -.08],
  });

  const blanket = mesh(root, blanketGeometry(compact), cloth, {
    name: 'sleep-blanket-lower',
    position: [0, -.31, .025],
    rotation: [-.07, -.045, -.08],
    scale: [.93, .82, 1],
  });

  const seamCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-.43, -.205, .073),
    new THREE.Vector3(-.20, -.195, .088),
    new THREE.Vector3(.02, -.205, .093),
    new THREE.Vector3(.23, -.19, .086),
    new THREE.Vector3(.43, -.17, .070),
  ]);
  mesh(root, new THREE.TubeGeometry(seamCurve, compactSegments(rig, 10, 20), .008, 6, false), seam, {
    name: 'sleep-blanket-seam',
    rotation: [-.055, -.03, -.07],
  });

  for (const [index, x] of [[0, -.19], [1, .10]]) {
    const foldCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, -.23 + index * .006, .082),
      new THREE.Vector3(x + .025, -.34, .092),
      new THREE.Vector3(x + .055, -.45, .064),
    ]);
    mesh(root, new THREE.TubeGeometry(foldCurve, compactSegments(rig, 7, 14), .008, 6, false), seam, {
      name: 'sleep-blanket-fold',
      rotation: [-.05, -.02, -.06],
    });
  }

  // The approved mock reads because the head has an obvious support. Keep the
  // pillow dark and directly behind the cream head, with the hands in front.
  const pillowGroup = new THREE.Group();
  pillowGroup.name = 'sleep-pillow-premium';
  pillowGroup.position.set(.01, .43, -.16);
  pillowGroup.rotation.set(-.035, -.06, -.04);
  root.add(pillowGroup);
  mesh(pillowGroup, new THREE.SphereGeometry(
    .22,
    compactSegments(rig, 16, 28),
    compactSegments(rig, 11, 18),
  ), pillow, {
    name: 'sleep-pillow-cushion',
    scale: [1.30, .66, .48],
  });
  mesh(pillowGroup, new THREE.TorusGeometry(.195, .013, 7, compactSegments(rig, 14, 24)), pillowEdge, {
    name: 'sleep-pillow-edge',
    rotation: [Math.PI / 2, 0, 0],
    scale: [1.18, .72, 1],
  });

  activityRig.premiumSleep = root;
  activityRig.sleepBlanketLower = blanket;
  activityRig.sleepPillowPremium = pillowGroup;
  activityRig.sleepRigVersion = MATTHIAS_HOME_SLEEP_RIG_VERSION;
  return root;
}

export function clearMatthiasHomeSleepRig(rig) {
  const activityRig = rig?.activityRig;
  if (!activityRig) return;
  if (activityRig.premiumSleep) activityRig.premiumSleep.visible = false;
  if (activityRig.support) activityRig.support.visible = false;
  if (activityRig.assist) activityRig.assist.visible = false;
  sleepElapsedSeconds(rig, {}, false);

  const canonical = activityRig.sleepCanonicalPose;
  if (canonical) {
    if (rig.headPivot) rig.headPivot.position.x = canonical.headX;
    if (rig.mouthGroup) {
      rig.mouthGroup.position.y = canonical.mouthY;
      rig.mouthGroup.scale.copy(canonical.mouthScale);
    }
  }

  if (rig?.root?.userData) {
    rig.root.userData.activitySleepState = 'inactive';
    rig.root.userData.activitySleepComposition = 'inactive';
    rig.root.userData.activitySleepReference = 'inactive';
    rig.root.userData.activitySleepAxis = 'inactive';
    rig.root.userData.activitySleepHeadSupport = 'inactive';
    rig.root.userData.activitySleepBreath = 0;
    rig.root.userData.activitySleepShiver = 0;
  }
}

export function applyMatthiasHomeSleepRig(rig, pose = {}) {
  const activityRig = rig?.activityRig;
  if (!activityRig) return false;
  const sleeping = normalizedProfile(pose.activityProfile) === 'sleep';
  if (!sleeping) {
    clearMatthiasHomeSleepRig(rig);
    return false;
  }

  rememberCanonicalPose(rig);
  const sleepRig = buildSleepRig(rig);
  if (!sleepRig) return false;

  const canonical = activityRig.sleepCanonicalPose;
  const reducedMotion = Boolean(pose.activityReducedMotion);
  const elapsed = sleepElapsedSeconds(rig, pose, true);
  const breath = reducedMotion ? 0 : Math.sin((elapsed / 4.2) * Math.PI * 2) * .006;
  const settle = reducedMotion ? 0 : Math.sin((elapsed / 14.0) * Math.PI * 2) * .004;
  const shiver = reducedMotion ? 0 : coldShiver(elapsed);

  // Retire the legacy blanket prop. The dedicated sleep composition is centred
  // on Matthias instead of being offset for the old diagonal pose.
  if (activityRig.blanket) activityRig.blanket.visible = false;
  sleepRig.visible = true;
  sleepRig.position.set(0, breath * .20, .40);
  sleepRig.rotation.set(-.045, -.025, settle * .12);
  sleepRig.scale.set(1.02, 1.02 + breath * .30, 1.02);

  // Approved canonical sleep pose: head left, base right, genuinely horizontal.
  // The tiny settle/shiver deltas can never return the pawn to a diagonal stance.
  rig.root.rotation.z = Math.PI / 2 + settle * .18 + shiver * .004;
  rig.root.rotation.y += -.045;
  rig.root.position.y -= .045 - breath * .22;
  rig.headPivot.rotation.x += .070;
  rig.headPivot.rotation.y += -.025;
  rig.headPivot.rotation.z -= .035 + settle * .16 + shiver * .003;
  rig.headPivot.position.x = canonical.headX + .025;
  rig.headPivot.position.y -= .035 - breath * .18;

  // Fold both arms under/around the head. They are part of the silhouette now,
  // not hidden props: the approved mock clearly reads hands supporting the nap.
  const {
    support,
    supportStem,
    supportGlove,
    assist,
    assistStem,
    assistGlove,
  } = activityRig;
  support.visible = true;
  assist.visible = true;
  supportStem.position.set(.20, .18, .47);
  supportStem.rotation.set(1.04, 0, -.34);
  supportGlove.position.set(.15, .405, .70);
  assistStem.position.set(-.20, .17, .46);
  assistStem.rotation.set(1.02, 0, .38);
  assistGlove.position.set(-.10, .425, .69);

  // Matthias sleeps angry. Eyes shut; canonical V-shaped brows and frown remain.
  rig.leftEye.scale.y = .070;
  rig.rightEye.scale.y = .070;
  rig.leftBrow.rotation.z = rig.base.leftBrowRz - .045;
  rig.rightBrow.rotation.z = rig.base.rightBrowRz + .045;
  rig.leftBrow.position.y = rig.base.leftBrowY - .012;
  rig.rightBrow.position.y = rig.base.rightBrowY - .012;
  rig.mouthGroup.visible = true;
  rig.speechMouth.visible = false;
  rig.mouthGroup.position.y = rig.base.mouthY - .006;
  rig.mouthGroup.rotation.z = 0;
  rig.mouthGroup.scale.set(
    canonical.mouthScale.x,
    canonical.mouthScale.y * .90,
    canonical.mouthScale.z,
  );

  rig.root.userData.activitySleepRigVersion = MATTHIAS_HOME_SLEEP_RIG_VERSION;
  rig.root.userData.activitySleepComposition = MATTHIAS_HOME_SLEEP_COMPOSITION;
  rig.root.userData.activitySleepReference = MATTHIAS_HOME_SLEEP_REFERENCE;
  rig.root.userData.activitySleepState = 'canonical-angry-horizontal-rest';
  rig.root.userData.activitySleepAxis = 'horizontal';
  rig.root.userData.activitySleepHeadSupport = 'hands+pillow';
  rig.root.userData.activitySleepBreath = breath;
  rig.root.userData.activitySleepShiver = Math.abs(shiver);
  rig.root.userData.activitySleepCold = 'occasional';
  return true;
}
