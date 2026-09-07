import * as THREE from 'three';

export const MATTHIAS_TACTICAL_MEAL_RIG_VERSION = 'tactical-meal-v3-campaign-dinner';
export const MATTHIAS_CAMPAIGN_DINNER_COMPOSITION_VERSION = 'campaign-dinner-v1-approved-mock';

const MEAL_CLOCKS = new WeakMap();
const DINNER_CYCLE_SECONDS = 8;

const BASE_LIMB_SCALE = {
  supportStem: [1, 1, 1],
  supportGlove: [1.05, .76, .90],
  assistStem: [1, 1, 1],
  assistGlove: [1.03, .74, .88],
};

const DINNER_LIMB_SCALE = {
  supportStem: [1.72, 1.18, 1.72],
  supportGlove: [1.48, 1.10, 1.28],
  assistStem: [1.72, 1.18, 1.72],
  assistGlove: [1.48, 1.10, 1.28],
};

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function material(color, {
  metalness = 0,
  roughness = .62,
  clearcoat = .04,
  transparent = false,
  opacity = 1,
} = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness,
    roughness,
    clearcoat,
    clearcoatRoughness: .22,
    transparent,
    opacity,
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

function setScale(node, scale) {
  if (!node || !Array.isArray(scale)) return;
  node.scale.set(...scale);
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
  const cycleProgress = reducedMotion ? .25 : (time % DINNER_CYCLE_SECONDS) / DINNER_CYCLE_SECONDS;
  return {
    phase: 'campaign-dinner',
    phaseIndex: 0,
    phaseProgress: cycleProgress,
    cycleProgress,
  };
}

function ensureCuff(glove, name, gold) {
  if (!glove) return null;
  const existing = glove.getObjectByName?.(name);
  if (existing) return existing;
  const cuff = mesh(
    glove,
    new THREE.TorusGeometry(.098, .018, 8, 20),
    gold,
    {
      name,
      position: [0, -.115, -.005],
      rotation: [Math.PI / 2, 0, 0],
      scale: [1.04, 1.04, 1.04],
    },
  );
  return cuff;
}

function buildCampaignDinnerRig(rig) {
  const activityRig = rig?.activityRig;
  if (!activityRig) return null;
  if (activityRig.tacticalMeal?.userData?.rigVersion === MATTHIAS_TACTICAL_MEAL_RIG_VERSION) {
    return activityRig.tacticalMeal;
  }

  if (activityRig.tacticalMeal) activityRig.root.remove(activityRig.tacticalMeal);

  const root = new THREE.Group();
  root.name = 'tactical-meal-rig';
  root.visible = false;
  root.userData.rigVersion = MATTHIAS_TACTICAL_MEAL_RIG_VERSION;
  root.userData.compositionVersion = MATTHIAS_CAMPAIGN_DINNER_COMPOSITION_VERSION;
  activityRig.root.add(root);

  const steel = material(0x858b8d, { metalness: .78, roughness: .26, clearcoat: .30 });
  const steelDark = material(0x4f5558, { metalness: .76, roughness: .30, clearcoat: .22 });
  const olive = material(0x566044, { metalness: .16, roughness: .52, clearcoat: .18 });
  const oliveDark = material(0x31372b, { metalness: .20, roughness: .48, clearcoat: .15 });
  const bread = material(0xc69b60, { roughness: .68 });
  const breadLight = material(0xe2bd82, { roughness: .64 });
  const meat = material(0x6b3325, { roughness: .74 });
  const potato = material(0xb77d45, { roughness: .72 });
  const carrot = material(0xc55f2d, { roughness: .70 });
  const pea = material(0x657847, { roughness: .76 });
  const gold = material(0xd3a13c, { metalness: .94, roughness: .18, clearcoat: .24 });
  const leather = material(0x1b2027, { metalness: .28, roughness: .24, clearcoat: .72 });
  const steam = material(0xf4eadc, { roughness: .75, transparent: true, opacity: .24 });

  const dinner = new THREE.Group();
  dinner.name = 'tactical-campaign-dinner';
  root.add(dinner);

  // The approved composition is deliberately one stable silhouette: a shallow
  // military mess tray spanning both hands, with a green mug, bread and stew.
  // No rotating hamburger/bocata/canteen roulette: at Home scale the action must
  // read immediately as "Cena de campaña".
  mesh(dinner, new THREE.BoxGeometry(.72, .34, .055), steel, {
    name: 'campaign-dinner-tray-base',
    position: [0, 0, 0],
  });
  mesh(dinner, new THREE.BoxGeometry(.76, .030, .085), steelDark, {
    name: 'campaign-dinner-tray-front-rim',
    position: [0, -.17, .032],
  });
  mesh(dinner, new THREE.BoxGeometry(.76, .026, .070), steelDark, {
    name: 'campaign-dinner-tray-back-rim',
    position: [0, .17, .026],
  });
  mesh(dinner, new THREE.BoxGeometry(.030, .34, .080), steelDark, {
    name: 'campaign-dinner-tray-left-rim',
    position: [-.36, 0, .030],
  });
  mesh(dinner, new THREE.BoxGeometry(.030, .34, .080), steelDark, {
    name: 'campaign-dinner-tray-right-rim',
    position: [.36, 0, .030],
  });

  const mug = new THREE.Group();
  mug.name = 'campaign-dinner-mug';
  mug.position.set(-.22, .015, .105);
  dinner.add(mug);
  mesh(mug, new THREE.CylinderGeometry(.105, .095, .22, 24), olive, {
    name: 'campaign-dinner-mug-body',
  });
  mesh(mug, new THREE.TorusGeometry(.104, .010, 7, 22), steel, {
    name: 'campaign-dinner-mug-rim',
    position: [0, .11, 0],
    rotation: [Math.PI / 2, 0, 0],
  });
  mesh(mug, new THREE.CylinderGeometry(.086, .086, .010, 20), oliveDark, {
    name: 'campaign-dinner-mug-coffee',
    position: [0, .107, 0],
  });
  mesh(mug, new THREE.TorusGeometry(.070, .016, 7, 18, Math.PI * 1.55), oliveDark, {
    name: 'campaign-dinner-mug-handle',
    position: [-.105, -.004, 0],
    rotation: [0, Math.PI / 2, .26],
  });

  const breadGroup = new THREE.Group();
  breadGroup.name = 'campaign-dinner-bread';
  breadGroup.position.set(.245, .035, .105);
  breadGroup.rotation.z = -.08;
  dinner.add(breadGroup);
  mesh(breadGroup, new THREE.BoxGeometry(.20, .15, .065), bread, {
    name: 'campaign-dinner-bread-slice',
    position: [0, 0, 0],
    rotation: [-.08, .04, .02],
  });
  mesh(breadGroup, new THREE.BoxGeometry(.172, .014, .070), breadLight, {
    name: 'campaign-dinner-bread-crumb',
    position: [0, .055, .014],
    rotation: [-.08, .04, .02],
  });

  const stew = new THREE.Group();
  stew.name = 'campaign-dinner-stew';
  stew.position.set(.035, -.005, .105);
  dinner.add(stew);
  const chunks = [
    [-.09, -.03, meat, .060],
    [-.025, .025, potato, .053],
    [.045, -.025, carrot, .048],
    [.105, .015, meat, .056],
    [.015, -.072, potato, .050],
    [-.125, .055, carrot, .043],
    [.135, -.060, pea, .038],
    [-.055, .075, pea, .038],
  ];
  for (const [x, y, mat, radius] of chunks) {
    mesh(stew, new THREE.SphereGeometry(radius, 12, 8), mat, {
      name: 'campaign-dinner-stew-chunk',
      position: [x, y, 0],
      scale: [1.15, .82, .75],
    });
  }

  const steamCurves = [
    [-.22, .14, .095],
    [.02, .12, .105],
  ];
  for (const [x, y, z] of steamCurves) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, y, z),
      new THREE.Vector3(x + .018, y + .075, z + .006),
      new THREE.Vector3(x - .012, y + .145, z + .010),
      new THREE.Vector3(x + .008, y + .205, z + .004),
    ]);
    mesh(dinner, new THREE.TubeGeometry(curve, 12, .007, 5, false), steam, {
      name: 'campaign-dinner-steam',
    });
  }

  // Brass cuff rings are attached to the actual hand meshes so the black gloves
  // remain readable against Matthias' black coat in a ~116 px Home portrait.
  const rightCuff = ensureCuff(activityRig.supportGlove, 'campaign-dinner-right-cuff', gold);
  const leftCuff = ensureCuff(activityRig.assistGlove, 'campaign-dinner-left-cuff', gold);
  if (rightCuff) rightCuff.visible = false;
  if (leftCuff) leftCuff.visible = false;

  activityRig.tacticalMeal = root;
  activityRig.campaignDinner = dinner;
  activityRig.campaignDinnerRightCuff = rightCuff;
  activityRig.campaignDinnerLeftCuff = leftCuff;
  activityRig.campaignDinnerLeather = leather;
  activityRig.tacticalMealRigVersion = MATTHIAS_TACTICAL_MEAL_RIG_VERSION;
  return root;
}

function applyDinnerLimbStyle(activityRig) {
  if (!activityRig) return;
  const { supportGlove, assistGlove } = activityRig;
  if (supportGlove && !supportGlove.userData.campaignDinnerBaseMaterial) {
    supportGlove.userData.campaignDinnerBaseMaterial = supportGlove.material;
  }
  if (assistGlove && !assistGlove.userData.campaignDinnerBaseMaterial) {
    assistGlove.userData.campaignDinnerBaseMaterial = assistGlove.material;
  }
  if (supportGlove && activityRig.campaignDinnerLeather) supportGlove.material = activityRig.campaignDinnerLeather;
  if (assistGlove && activityRig.campaignDinnerLeather) assistGlove.material = activityRig.campaignDinnerLeather;

  setScale(activityRig.supportStem, DINNER_LIMB_SCALE.supportStem);
  setScale(activityRig.supportGlove, DINNER_LIMB_SCALE.supportGlove);
  setScale(activityRig.assistStem, DINNER_LIMB_SCALE.assistStem);
  setScale(activityRig.assistGlove, DINNER_LIMB_SCALE.assistGlove);
}

function restoreBaseLimbStyle(activityRig) {
  if (!activityRig) return;
  setScale(activityRig.supportStem, BASE_LIMB_SCALE.supportStem);
  setScale(activityRig.supportGlove, BASE_LIMB_SCALE.supportGlove);
  setScale(activityRig.assistStem, BASE_LIMB_SCALE.assistStem);
  setScale(activityRig.assistGlove, BASE_LIMB_SCALE.assistGlove);

  if (activityRig.supportGlove?.userData?.campaignDinnerBaseMaterial) {
    activityRig.supportGlove.material = activityRig.supportGlove.userData.campaignDinnerBaseMaterial;
  }
  if (activityRig.assistGlove?.userData?.campaignDinnerBaseMaterial) {
    activityRig.assistGlove.material = activityRig.assistGlove.userData.campaignDinnerBaseMaterial;
  }
}

export function applyMatthiasTacticalMeal(rig, pose = {}) {
  const activityRig = rig?.activityRig;
  if (!activityRig) return null;
  const mealRoot = buildCampaignDinnerRig(rig);
  if (!mealRoot) return null;

  const time = elapsedSeconds(rig, pose, true);
  const state = matthiasTacticalMealState(time, {
    reducedMotion: Boolean(pose.activityReducedMotion),
  });
  const reduced = Boolean(pose.activityReducedMotion);
  const reach = clamp01(rig.root?.userData?.activityReach ?? pose.reach);
  const pulse = reduced ? 0 : Math.sin(state.cycleProgress * Math.PI * 2);
  const settle = reduced ? 0 : Math.sin(state.cycleProgress * Math.PI * 4) * .003;

  if (activityRig.ration) activityRig.ration.visible = false;
  if (activityRig.tacticalBurger) activityRig.tacticalBurger.visible = false;
  if (activityRig.tacticalFieldRation) activityRig.tacticalFieldRation.visible = false;
  if (activityRig.tacticalCanteen) activityRig.tacticalCanteen.visible = false;

  mealRoot.visible = true;
  activityRig.campaignDinner.visible = true;
  setPose(
    activityRig.campaignDinner,
    [0, -.53 + reach * .035 + settle, .88],
    [-.34 + pulse * .012, 0, pulse * .008],
    1.02,
  );

  applyDinnerLimbStyle(activityRig);
  activityRig.support.visible = true;
  activityRig.assist.visible = true;

  // Open elbows and put both glossy gloves outside the tray silhouette. This is
  // deliberately exaggerated for the small Home card, matching the approved mock.
  setLimb(
    activityRig.supportStem,
    activityRig.supportGlove,
    [.48, -.38 + settle, .64],
    -.73,
    [.505, -.40 + reach * .018 + settle, .89],
  );
  setLimb(
    activityRig.assistStem,
    activityRig.assistGlove,
    [-.48, -.38 + settle, .64],
    .73,
    [-.505, -.40 + reach * .018 + settle, .89],
  );

  if (activityRig.campaignDinnerRightCuff) activityRig.campaignDinnerRightCuff.visible = true;
  if (activityRig.campaignDinnerLeftCuff) activityRig.campaignDinnerLeftCuff.visible = true;

  // Tiny head acknowledgement only; the tray and hands remain the primary read.
  rig.headPivot.rotation.x += .018 + pulse * .006;

  rig.root.userData.activityMealPhase = 'campaign-dinner';
  rig.root.userData.activityMealPhaseProgress = state.phaseProgress;
  rig.root.userData.activityMealRigVersion = MATTHIAS_TACTICAL_MEAL_RIG_VERSION;
  rig.root.userData.activityMealComposition = MATTHIAS_CAMPAIGN_DINNER_COMPOSITION_VERSION;
  rig.root.userData.activityMealArmStyle = 'campaign-dinner-open-hands-v3';
  return state;
}

export function clearMatthiasTacticalMeal(rig) {
  const activityRig = rig?.activityRig;
  if (!activityRig) return;
  elapsedSeconds(rig, null, false);
  if (activityRig.tacticalMeal) activityRig.tacticalMeal.visible = false;
  if (activityRig.campaignDinner) activityRig.campaignDinner.visible = false;
  if (activityRig.tacticalBurger) activityRig.tacticalBurger.visible = false;
  if (activityRig.tacticalFieldRation) activityRig.tacticalFieldRation.visible = false;
  if (activityRig.tacticalCanteen) activityRig.tacticalCanteen.visible = false;
  if (activityRig.campaignDinnerRightCuff) activityRig.campaignDinnerRightCuff.visible = false;
  if (activityRig.campaignDinnerLeftCuff) activityRig.campaignDinnerLeftCuff.visible = false;
  restoreBaseLimbStyle(activityRig);
  rig.root.userData.activityMealPhase = 'inactive';
  rig.root.userData.activityMealPhaseProgress = 0;
  rig.root.userData.activityMealComposition = 'inactive';
  rig.root.userData.activityMealArmStyle = 'inactive';
}
