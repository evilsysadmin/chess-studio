import * as THREE from 'three';

export const MATTHIAS_TACTICAL_MEAL_RIG_VERSION = 'tactical-meal-v1-four-course';

const MEAL_CLOCKS = new WeakMap();
const MEAL_CYCLE_SECONDS = 24;

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function material(color, {
  metalness = 0,
  roughness = .62,
  clearcoat = .04,
} = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness,
    roughness,
    clearcoat,
    clearcoatRoughness: .28,
  });
}

function mesh(parent, geometry, mat, {
  name = '',
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = [1, 1, 1],
} = {}) {
  const next = new THREE.Mesh(geometry, mat);
  next.name = name;
  next.position.set(...position);
  next.rotation.set(...rotation);
  next.scale.set(...scale);
  next.castShadow = false;
  next.receiveShadow = false;
  parent.add(next);
  return next;
}

function setPose(group, position, rotation, scale = 1) {
  if (!group) return;
  group.position.set(...position);
  group.rotation.set(...rotation);
  group.scale.setScalar(scale);
}

function setLimb(stem, glove, stemPosition, stemRotationZ, glovePosition) {
  if (!stem || !glove) return;
  stem.position.set(...stemPosition);
  stem.rotation.z = stemRotationZ;
  glove.position.set(...glovePosition);
}

function elapsedSeconds(rig, pose, active) {
  const explicit = Number(pose?.activityTime);
  if (Number.isFinite(explicit)) return Math.max(0, explicit);
  if (!active) {
    MEAL_CLOCKS.delete(rig);
    return 0;
  }
  const now = typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now() / 1000
    : Date.now() / 1000;
  const startedAt = MEAL_CLOCKS.get(rig);
  if (!Number.isFinite(startedAt)) {
    MEAL_CLOCKS.set(rig, now);
    return 0;
  }
  return Math.max(0, now - startedAt);
}

export function matthiasTacticalMealState(activityTime = 0, {
  reducedMotion = false,
} = {}) {
  const time = Math.max(0, Number(activityTime) || 0);
  if (reducedMotion) {
    return { phase: 'bocata', phaseIndex: 1, phaseProgress: .35, cycleProgress: 0 };
  }

  const cycle = time % MEAL_CYCLE_SECONDS;
  const phaseIndex = Math.floor(cycle / 6) % 4;
  const phaseProgress = (cycle % 6) / 6;
  const phase = ['burger', 'bocata', 'field-ration', 'canteen'][phaseIndex];
  return {
    phase,
    phaseIndex,
    phaseProgress,
    cycleProgress: cycle / MEAL_CYCLE_SECONDS,
  };
}

function buildMealRig(rig) {
  const activityRig = rig?.activityRig;
  if (!activityRig) return null;
  if (activityRig.tacticalMeal?.userData?.rigVersion === MATTHIAS_TACTICAL_MEAL_RIG_VERSION) {
    return activityRig.tacticalMeal;
  }

  const root = new THREE.Group();
  root.name = 'tactical-meal-rig';
  root.userData.rigVersion = MATTHIAS_TACTICAL_MEAL_RIG_VERSION;
  activityRig.root.add(root);

  const bun = material(0xd39a53, { roughness: .72 });
  const bunLight = material(0xf0c783, { roughness: .68 });
  const meat = material(0x4b241c, { roughness: .80 });
  const cheese = material(0xe7b844, { roughness: .62 });
  const lettuce = material(0x5f7d39, { roughness: .82 });
  const fieldOlive = material(0x4e5535, { metalness: .12, roughness: .68, clearcoat: .08 });
  const fieldDark = material(0x292d22, { metalness: .22, roughness: .58, clearcoat: .10 });
  const fieldPaper = material(0xb5aa88, { roughness: .84 });
  const steel = material(0x7b8182, { metalness: .72, roughness: .30, clearcoat: .20 });
  const water = new THREE.MeshPhysicalMaterial({
    color: 0x9eb7bb,
    metalness: 0,
    roughness: .12,
    clearcoat: .58,
    transparent: true,
    opacity: .42,
  });

  // Burger: deliberately chunky layers so it still reads as food at 128 px.
  const burger = new THREE.Group();
  burger.name = 'tactical-meal-burger';
  root.add(burger);
  mesh(burger, new THREE.CylinderGeometry(.20, .18, .095, 24), bun, {
    name: 'tactical-burger-bottom', position: [0, -.105, 0], scale: [1, .72, 1],
  });
  mesh(burger, new THREE.CylinderGeometry(.19, .19, .070, 24), meat, {
    name: 'tactical-burger-patty', position: [0, -.035, 0], scale: [1, .72, 1],
  });
  mesh(burger, new THREE.BoxGeometry(.33, .025, .31), cheese, {
    name: 'tactical-burger-cheese', position: [0, .018, 0], rotation: [0, .15, .08],
  });
  mesh(burger, new THREE.TorusGeometry(.145, .022, 8, 24), lettuce, {
    name: 'tactical-burger-lettuce', position: [0, .055, 0], rotation: [Math.PI / 2, 0, 0], scale: [1.05, .84, 1],
  });
  mesh(burger, new THREE.SphereGeometry(.205, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), bunLight, {
    name: 'tactical-burger-top', position: [0, .055, 0], scale: [1, .68, 1],
  });
  for (const [x, z] of [[-.07, .05], [.04, -.04], [.09, .055], [-.10, -.035]]) {
    mesh(burger, new THREE.SphereGeometry(.009, 7, 5), fieldPaper, {
      name: 'tactical-burger-sesame', position: [x, .178, z], scale: [1.4, .45, .8],
    });
  }

  // Field ration: mess tin + opened khaki pouch + spoon. It should look issued,
  // not plated restaurant food.
  const fieldRation = new THREE.Group();
  fieldRation.name = 'tactical-meal-field-ration';
  root.add(fieldRation);
  mesh(fieldRation, new THREE.BoxGeometry(.46, .28, .055), fieldOlive, {
    name: 'tactical-ration-mess-tin', position: [0, -.03, 0], rotation: [-.08, .05, -.04],
  });
  mesh(fieldRation, new THREE.BoxGeometry(.39, .215, .030), fieldPaper, {
    name: 'tactical-ration-food-tray', position: [0, .012, .045], rotation: [-.08, .05, -.04],
  });
  mesh(fieldRation, new THREE.BoxGeometry(.18, .28, .025), fieldOlive, {
    name: 'tactical-ration-pouch', position: [-.28, .03, .02], rotation: [-.05, -.18, .12],
  });
  mesh(fieldRation, new THREE.BoxGeometry(.12, .022, .012), fieldDark, {
    name: 'tactical-ration-label', position: [-.29, .03, .041], rotation: [-.05, -.18, .12],
  });
  mesh(fieldRation, new THREE.CapsuleGeometry(.012, .30, 4, 10), steel, {
    name: 'tactical-ration-spoon', position: [.24, .04, .09], rotation: [0, 0, -.78],
  });

  // Canteen: flattened olive body, short neck/cap and a tiny translucent water lip.
  const canteen = new THREE.Group();
  canteen.name = 'tactical-meal-canteen';
  root.add(canteen);
  mesh(canteen, new THREE.SphereGeometry(.20, 24, 18), fieldOlive, {
    name: 'tactical-canteen-body', scale: [.82, 1.12, .34],
  });
  mesh(canteen, new THREE.CylinderGeometry(.065, .075, .13, 16), fieldOlive, {
    name: 'tactical-canteen-neck', position: [0, .225, 0],
  });
  mesh(canteen, new THREE.CylinderGeometry(.078, .078, .045, 16), fieldDark, {
    name: 'tactical-canteen-cap', position: [0, .305, 0],
  });
  mesh(canteen, new THREE.TorusGeometry(.061, .009, 6, 16), water, {
    name: 'tactical-canteen-water', position: [0, .284, .006], rotation: [Math.PI / 2, 0, 0],
  });
  mesh(canteen, new THREE.TorusGeometry(.245, .018, 6, 22, Math.PI * 1.25), fieldDark, {
    name: 'tactical-canteen-strap', position: [.02, -.03, -.04], rotation: [0, 0, -.28], scale: [.72, 1, 1],
  });

  for (const group of [burger, fieldRation, canteen]) group.visible = false;

  activityRig.tacticalMeal = root;
  activityRig.tacticalBurger = burger;
  activityRig.tacticalFieldRation = fieldRation;
  activityRig.tacticalCanteen = canteen;
  activityRig.tacticalMealRigVersion = MATTHIAS_TACTICAL_MEAL_RIG_VERSION;
  return root;
}

function setMealVisibility(activityRig, phase) {
  if (!activityRig) return;
  if (activityRig.ration) activityRig.ration.visible = phase === 'bocata';
  if (activityRig.tacticalBurger) activityRig.tacticalBurger.visible = phase === 'burger';
  if (activityRig.tacticalFieldRation) activityRig.tacticalFieldRation.visible = phase === 'field-ration';
  if (activityRig.tacticalCanteen) activityRig.tacticalCanteen.visible = phase === 'canteen';
}

export function applyMatthiasTacticalMeal(rig, pose = {}) {
  const activityRig = rig?.activityRig;
  if (!activityRig) return null;
  buildMealRig(rig);

  const time = elapsedSeconds(rig, pose, true);
  const state = matthiasTacticalMealState(time, {
    reducedMotion: Boolean(pose.activityReducedMotion),
  });
  setMealVisibility(activityRig, state.phase);

  const reach = clamp01(rig.root?.userData?.activityReach ?? pose.reach);
  const biteLift = Math.sin(state.phaseProgress * Math.PI) * .13;
  const {
    ration,
    tacticalBurger: burger,
    tacticalFieldRation: fieldRation,
    tacticalCanteen: canteen,
    support,
    supportStem,
    supportGlove,
    assist,
    assistStem,
    assistGlove,
  } = activityRig;

  if (state.phase === 'burger') {
    setPose(burger, [.12, -.46 + biteLift + reach * .10, .88], [-.10, -.14, -.035], .92);
    support.visible = true;
    assist.visible = true;
    setLimb(supportStem, supportGlove, [.36, -.34, .48], -.68, [.31, burger.position.y - .02, .80]);
    setLimb(assistStem, assistGlove, [-.33, -.34, .47], .68, [-.11, burger.position.y - .02, .79]);
    rig.headPivot.rotation.x += .025 + biteLift * .10;
  } else if (state.phase === 'bocata') {
    setPose(ration, [.22, -.56 + biteLift * .72 + reach * .07, .80], [-.34, -.12, -.08], .90);
    support.visible = true;
    assist.visible = true;
    setLimb(supportStem, supportGlove, [.36, -.40, .48], -.60, [.39, ration.position.y + .05, .73]);
    setLimb(assistStem, assistGlove, [-.28, -.40, .47], .67, [.03, ration.position.y + .05, .72]);
  } else if (state.phase === 'field-ration') {
    setPose(fieldRation, [.18, -.62 + reach * .04, .79], [-.48, -.18, -.08], .90);
    support.visible = true;
    assist.visible = true;
    setLimb(supportStem, supportGlove, [.35, -.42, .48], -.62, [.39, -.47, .72]);
    setLimb(assistStem, assistGlove, [-.30, -.37, .47], .72, [-.05, -.35 + biteLift * .45, .76]);
    rig.headPivot.rotation.x += .035;
  } else {
    const sipLift = Math.sin(state.phaseProgress * Math.PI) * .23;
    setPose(canteen, [.43 - sipLift * .45, -.37 + sipLift + reach * .08, .83], [.18 + sipLift * .85, -.18, -.22], .88);
    support.visible = true;
    assist.visible = false;
    setLimb(supportStem, supportGlove, [.38, -.34, .48], -.68, [canteen.position.x + .05, canteen.position.y - .02, .74]);
    rig.headPivot.rotation.x += sipLift * .22;
  }

  rig.root.userData.activityMealPhase = state.phase;
  rig.root.userData.activityMealPhaseProgress = state.phaseProgress;
  rig.root.userData.activityMealRigVersion = MATTHIAS_TACTICAL_MEAL_RIG_VERSION;
  return state;
}

export function clearMatthiasTacticalMeal(rig) {
  const activityRig = rig?.activityRig;
  if (!activityRig) return;
  elapsedSeconds(rig, null, false);
  if (activityRig.tacticalBurger) activityRig.tacticalBurger.visible = false;
  if (activityRig.tacticalFieldRation) activityRig.tacticalFieldRation.visible = false;
  if (activityRig.tacticalCanteen) activityRig.tacticalCanteen.visible = false;
  rig.root.userData.activityMealPhase = 'inactive';
  rig.root.userData.activityMealPhaseProgress = 0;
}
