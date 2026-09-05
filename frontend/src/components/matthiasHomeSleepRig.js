import * as THREE from 'three';

export const MATTHIAS_HOME_SLEEP_RIG_VERSION = 'home-sleep-v2-canonical-grumpy-cold';
export const MATTHIAS_HOME_SLEEP_COMPOSITION = 'canonical-side-nap-low-blanket-v2';

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
  // A deliberately modest blanket: it covers the lower pawn body and nothing
  // else. Matthias' black coat, cream face and officer cap remain the silhouette.
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
  // One brief involuntary shiver every ~13 seconds. It is intentionally tiny:
  // Matthias is cold, not attached to a washing machine on spin cycle.
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

  // A low dark volume suggests cloth over the lower body without recolouring or
  // replacing Matthias. This is the key difference from v1's red cocoon.
  mesh(root, new THREE.SphereGeometry(
    .44,
    compactSegments(rig, 18, 30),
    compactSegments(rig, 12, 20),
  ), clothShadow, {
    name: 'sleep-blanket-underfold',
    position: [-.02, -.35, -.055],
    scale: [1.08, .34, .30],
    rotation: [0, -.04, -.12],
  });

  const blanket = mesh(root, blanketGeometry(compact), cloth, {
    name: 'sleep-blanket-lower',
    position: [0, -.31, .025],
    rotation: [-.07, -.045, -.12],
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
    rotation: [-.055, -.03, -.10],
  });

  for (const [index, x] of [[0, -.19], [1, .10]]) {
    const foldCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, -.23 + index * .006, .082),
      new THREE.Vector3(x + .025, -.34, .092),
      new THREE.Vector3(x + .055, -.45, .064),
    ]);
    mesh(root, new THREE.TubeGeometry(foldCurve, compactSegments(rig, 7, 14), .008, 6, false), seam, {
      name: 'sleep-blanket-fold',
      rotation: [-.05, -.02, -.09],
    });
  }

  // Small dark pillow, intentionally subordinate to Matthias rather than a giant
  // cream prop competing with his face.
  const pillowGroup = new THREE.Group();
  pillowGroup.name = 'sleep-pillow-premium';
  pillowGroup.position.set(.43, .37, -.18);
  pillowGroup.rotation.set(-.04, -.09, -.20);
  root.add(pillowGroup);
  mesh(pillowGroup, new THREE.SphereGeometry(
    .22,
    compactSegments(rig, 16, 28),
    compactSegments(rig, 11, 18),
  ), pillow, {
    name: 'sleep-pillow-cushion',
    scale: [1.25, .62, .46],
  });
  mesh(pillowGroup, new THREE.TorusGeometry(.195, .013, 7, compactSegments(rig, 14, 24)), pillowEdge, {
    name: 'sleep-pillow-edge',
    rotation: [Math.PI / 2, 0, 0],
    scale: [1.15, .68, 1],
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

  // Retire the old blanket prop. The new blanket is low, dark and only covers the
  // lower body, so the canonical black pawn remains visible at a glance.
  if (activityRig.blanket) activityRig.blanket.visible = false;
  activityRig.support.visible = false;
  activityRig.assist.visible = false;
  sleepRig.visible = true;
  sleepRig.position.set(.015, -.40 + breath * .30, .43);
  sleepRig.rotation.set(-.055, -.035, -.045 + settle * .35);
  sleepRig.scale.set(1.02, 1.02 + breath * .35, 1.02);

  // Side nap: strong enough to read as lying down, but still the exact canonical
  // pawn geometry. Assign absolute offsets where state could otherwise accumulate.
  rig.root.rotation.z = -.50 + settle * .30 + shiver * .006;
  rig.root.rotation.y += -.075;
  rig.root.position.y -= .050 - breath * .30;
  rig.headPivot.rotation.x += .115;
  rig.headPivot.rotation.y += -.040;
  rig.headPivot.rotation.z -= .215 + settle * .22 + shiver * .004;
  rig.headPivot.position.x = canonical.headX + .105;
  rig.headPivot.position.y -= .052 - breath * .24;

  // Matthias sleeps angry. Eyes shut; canonical V-shaped brows and frown remain.
  rig.leftEye.scale.y = .085;
  rig.rightEye.scale.y = .085;
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
  rig.root.userData.activitySleepState = 'canonical-angry-side-nap';
  rig.root.userData.activitySleepBreath = breath;
  rig.root.userData.activitySleepShiver = Math.abs(shiver);
  rig.root.userData.activitySleepCold = 'occasional';
  return true;
}
