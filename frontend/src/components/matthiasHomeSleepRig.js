import * as THREE from 'three';

export const MATTHIAS_HOME_SLEEP_RIG_VERSION = 'home-sleep-v1-reclined-wrap';
export const MATTHIAS_HOME_SLEEP_COMPOSITION = 'reclined-pillow-wrap-v1';

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

function wrapGeometry(compact = false) {
  const shape = new THREE.Shape();
  // Keep the front drape deliberately below the face. The rounded rear volume
  // carries the wrapped silhouette; this front edge must never become a lectern.
  shape.moveTo(-.62, .08);
  shape.quadraticCurveTo(-.67, .02, -.61, -.10);
  shape.lineTo(-.50, -.39);
  shape.quadraticCurveTo(-.27, -.50, .03, -.48);
  shape.quadraticCurveTo(.33, -.47, .56, -.31);
  shape.lineTo(.62, .07);
  shape.quadraticCurveTo(.61, .14, .52, .20);
  shape.quadraticCurveTo(.26, .18, .03, .14);
  shape.quadraticCurveTo(-.28, .11, -.62, .08);
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: .13,
    curveSegments: compact ? 5 : 10,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: compact ? 1 : 3,
    bevelSize: .035,
    bevelThickness: .025,
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

function buildSleepRig(rig) {
  const activityRig = rig?.activityRig;
  if (!activityRig) return null;
  if (activityRig.premiumSleep?.userData?.rigVersion === MATTHIAS_HOME_SLEEP_RIG_VERSION) {
    return activityRig.premiumSleep;
  }
  if (activityRig.premiumSleep) activityRig.root.remove(activityRig.premiumSleep);

  const cloth = sleepMaterial(0x4b211f, { roughness: .91 });
  const clothHighlight = sleepMaterial(0x6c3430, { roughness: .92 });
  const clothShadow = sleepMaterial(0x321716, { roughness: .94 });
  const pillow = sleepMaterial(0xc5ae86, { roughness: .91 });
  const pillowEdge = sleepMaterial(0x9f865f, { roughness: .92 });
  const gold = sleepMaterial(0xb98b39, { metalness: .58, roughness: .38, clearcoat: .10 });

  const root = new THREE.Group();
  root.name = 'premium-sleep-rig';
  root.visible = false;
  root.userData.rigVersion = MATTHIAS_HOME_SLEEP_RIG_VERSION;
  activityRig.root.add(root);

  // A rounded volume behind the front drape makes the blanket read as wrapped
  // cloth around a reclining pawn instead of a flat burgundy lectern.
  mesh(root, new THREE.SphereGeometry(.53, compactSegments(rig, 20, 32), compactSegments(rig, 14, 22)), clothShadow, {
    name: 'sleep-wrap-volume',
    position: [-.02, -.10, -.07],
    scale: [1.12, .72, .44],
    rotation: [0, -.06, -.16],
  });

  mesh(root, wrapGeometry(Boolean(rig?.root?.userData?.compact)), cloth, {
    name: 'sleep-wrap-body',
    position: [0, -.08, .04],
    rotation: [-.09, -.07, -.14],
    scale: [1.08, 1.08, 1],
  });

  // Right-hand tuck: the blanket curls around the side toward the pillow. This
  // breaks the old rectangular silhouette and hides more of the pawn base.
  mesh(root, new THREE.CapsuleGeometry(.16, .53, 5, 18), clothHighlight, {
    name: 'sleep-wrap-side-tuck',
    position: [.46, -.18, -.005],
    rotation: [Math.PI / 2, .08, -.30],
    scale: [.90, 1.02, .62],
  });

  const trimCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-.54, .055, .115),
    new THREE.Vector3(-.27, .085, .135),
    new THREE.Vector3(.02, .115, .145),
    new THREE.Vector3(.28, .150, .138),
    new THREE.Vector3(.52, .185, .116),
  ]);
  mesh(root, new THREE.TubeGeometry(trimCurve, compactSegments(rig, 12, 24), .014, 7, false), gold, {
    name: 'sleep-wrap-trim',
    rotation: [-.08, -.05, -.13],
  });

  for (const [index, x] of [[0, -.32], [1, -.06], [2, .22]]) {
    const foldCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, .035 + index * .014, .128),
      new THREE.Vector3(x + .035, -.11, .148),
      new THREE.Vector3(x + .08, -.33, .115),
    ]);
    mesh(root, new THREE.TubeGeometry(foldCurve, compactSegments(rig, 8, 16), .012, 6, false), clothHighlight, {
      name: 'sleep-wrap-fold',
      rotation: [-.07, -.03, -.11],
    });
  }

  const pillowGroup = new THREE.Group();
  pillowGroup.name = 'sleep-pillow-premium';
  pillowGroup.position.set(.47, .50, -.25);
  pillowGroup.rotation.set(-.03, -.10, -.22);
  root.add(pillowGroup);
  mesh(pillowGroup, new THREE.SphereGeometry(.25, compactSegments(rig, 18, 30), compactSegments(rig, 12, 20)), pillow, {
    name: 'sleep-pillow-cushion',
    scale: [1.30, .68, .50],
  });
  mesh(pillowGroup, new THREE.TorusGeometry(.225, .018, 7, compactSegments(rig, 16, 28)), pillowEdge, {
    name: 'sleep-pillow-edge',
    rotation: [Math.PI / 2, 0, 0],
    scale: [1.18, .72, 1],
  });

  activityRig.premiumSleep = root;
  activityRig.sleepPillowPremium = pillowGroup;
  activityRig.sleepRigVersion = MATTHIAS_HOME_SLEEP_RIG_VERSION;
  return root;
}

function compactSegments(rig, compactValue, fullValue) {
  return rig?.root?.userData?.renderTier === 'compact' ? compactValue : fullValue;
}

export function clearMatthiasHomeSleepRig(rig) {
  const activityRig = rig?.activityRig;
  if (!activityRig) return;
  if (activityRig.premiumSleep) activityRig.premiumSleep.visible = false;
  sleepElapsedSeconds(rig, {}, false);
  if (rig?.root?.userData) {
    rig.root.userData.activitySleepState = 'inactive';
    rig.root.userData.activitySleepComposition = 'inactive';
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

  const sleepRig = buildSleepRig(rig);
  if (!sleepRig) return false;
  const reducedMotion = Boolean(pose.activityReducedMotion);
  const elapsed = sleepElapsedSeconds(rig, pose, true);
  const breath = reducedMotion ? 0 : Math.sin((elapsed / 3.6) * Math.PI * 2) * .008;
  const settle = reducedMotion ? 0 : Math.sin((elapsed / 12.5) * Math.PI * 2) * .008;

  // Retire the old front-facing blanket. Its dossier-like silhouette is kept in
  // the base rig only for backwards compatibility; Home sleep uses this scene.
  if (activityRig.blanket) activityRig.blanket.visible = false;
  activityRig.support.visible = false;
  activityRig.assist.visible = false;
  sleepRig.visible = true;
  sleepRig.position.set(.015, -.30 + breath, .72);
  sleepRig.rotation.set(-.06, -.04, -.055 + settle);
  sleepRig.scale.set(1.06, 1.06 + breath * .7, 1.06);

  // Strong lateral recline is intentional. The previous -0.085 root roll was a
  // seated nod-off; this reads as an actual nap with the head sinking into a pillow.
  rig.root.rotation.z = -.245 + settle * .35;
  rig.root.rotation.y += -.065;
  rig.root.position.y -= .040;
  rig.headPivot.rotation.x += .105;
  rig.headPivot.rotation.y += -.035;
  rig.headPivot.rotation.z -= .145 + settle * .20;
  rig.headPivot.position.x += .085;
  rig.headPivot.position.y -= .040 - breath * .45;

  // Sleep face: closed eyes, almost-horizontal brows and a flattened frown. He is
  // resting, not auditing the Luftwaffe budget with his eyes shut.
  rig.leftEye.scale.y = .095;
  rig.rightEye.scale.y = .095;
  rig.leftBrow.rotation.z = Math.PI / 2 - .12;
  rig.rightBrow.rotation.z = Math.PI / 2 + .12;
  rig.leftBrow.position.y = rig.base.leftBrowY - .018;
  rig.rightBrow.position.y = rig.base.rightBrowY - .018;
  rig.mouthGroup.scale.set(.86, .58, .86);
  rig.mouthGroup.position.y = rig.base.mouthY - .008;
  rig.mouthGroup.rotation.z = .018;

  rig.root.userData.activitySleepRigVersion = MATTHIAS_HOME_SLEEP_RIG_VERSION;
  rig.root.userData.activitySleepComposition = MATTHIAS_HOME_SLEEP_COMPOSITION;
  rig.root.userData.activitySleepState = 'reclined';
  rig.root.userData.activitySleepBreath = breath;
  return true;
}
