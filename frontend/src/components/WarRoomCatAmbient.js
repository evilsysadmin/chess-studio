import * as THREE from 'three';

export const WAR_ROOM_CAT_AMBIENT_VERSION = 'war-room-cat-v1';
export const WAR_ROOM_CAT_APPEARANCE_CHANCE = 0.28;
export const WAR_ROOM_CAT_ROUTINES = Object.freeze(['observer', 'sofa-sleeper', 'groomer']);

const FLOOR_Y = -0.22;
const catStateCache = new WeakMap();

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function smoothstep01(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function headingTo(fromX, fromZ, toX, toZ, fallback = 0) {
  const dx = Number(toX) - Number(fromX);
  const dz = Number(toZ) - Number(fromZ);
  if (!Number.isFinite(dx) || !Number.isFinite(dz) || (dx * dx + dz * dz) < 1e-8) return fallback;
  return Math.atan2(dx, dz);
}

function material(color, options = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: options.roughness ?? 0.74,
    metalness: options.metalness ?? 0,
    clearcoat: options.clearcoat ?? 0.04,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.58,
    specularIntensity: options.specularIntensity ?? 0.24,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
  });
}

function addMesh(parent, geometry, mat, position, name, rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function createCat() {
  const group = new THREE.Group();
  group.name = 'war-room-cat';
  group.userData.warRoomAmbientCreature = WAR_ROOM_CAT_AMBIENT_VERSION;

  const model = new THREE.Group();
  model.name = 'war-room-cat-model';
  group.add(model);

  const fur = material(0x625a52, { roughness: 0.86, clearcoat: 0.02 });
  const furDark = material(0x3b3734, { roughness: 0.9, clearcoat: 0.01 });
  const muzzle = material(0xa69a8c, { roughness: 0.92, clearcoat: 0 });
  const noseMat = material(0x6d4543, { roughness: 0.78, clearcoat: 0.06 });
  const eyeMat = material(0xd6ad52, {
    roughness: 0.4,
    clearcoat: 0.28,
    emissive: 0x50330c,
    emissiveIntensity: 0.32,
  });

  const body = addMesh(model, new THREE.SphereGeometry(0.36, 14, 10), fur, [0, 0.39, -0.05], 'war-room-cat-body');
  body.scale.set(0.94, 0.82, 1.5);

  const chest = addMesh(model, new THREE.SphereGeometry(0.25, 12, 9), fur, [0, 0.47, 0.34], 'war-room-cat-chest');
  chest.scale.set(0.92, 1.08, 0.92);

  const headPivot = new THREE.Group();
  headPivot.name = 'war-room-cat-head-pivot';
  headPivot.position.set(0, 0.64, 0.55);
  model.add(headPivot);

  const head = addMesh(headPivot, new THREE.SphereGeometry(0.24, 14, 10), fur, [0, 0, 0], 'war-room-cat-head');
  head.scale.set(0.96, 0.93, 0.92);
  const snout = addMesh(headPivot, new THREE.SphereGeometry(0.115, 10, 8), muzzle, [0, -0.07, 0.2], 'war-room-cat-muzzle');
  snout.scale.set(1.22, 0.62, 0.72);
  addMesh(headPivot, new THREE.SphereGeometry(0.035, 9, 7), noseMat, [0, -0.045, 0.292], 'war-room-cat-nose');

  for (const side of [-1, 1]) {
    const ear = addMesh(
      headPivot,
      new THREE.ConeGeometry(0.105, 0.25, 4),
      furDark,
      [side * 0.135, 0.21, 0.015],
      `war-room-cat-ear-${side < 0 ? 'left' : 'right'}`,
      [0.05, 0, side * 0.08],
    );
    ear.scale.z = 0.72;
  }

  const eyes = [];
  for (const side of [-1, 1]) {
    const eye = addMesh(
      headPivot,
      new THREE.SphereGeometry(0.035, 10, 7),
      eyeMat,
      [side * 0.082, 0.025, 0.208],
      `war-room-cat-eye-${side < 0 ? 'left' : 'right'}`,
    );
    eye.scale.set(0.88, 1.08, 0.55);
    eyes.push(eye);
  }

  const legs = [];
  for (const [side, z, prefix] of [
    [-1, 0.25, 'front-left'],
    [1, 0.25, 'front-right'],
    [-1, -0.34, 'rear-left'],
    [1, -0.34, 'rear-right'],
  ]) {
    const leg = new THREE.Group();
    leg.name = `war-room-cat-leg-${prefix}`;
    leg.position.set(side * 0.19, 0.24, z);
    const limb = addMesh(leg, new THREE.CapsuleGeometry(0.052, 0.25, 3, 7), furDark, [0, -0.11, 0], `war-room-cat-limb-${prefix}`);
    limb.scale.y = 0.92;
    const paw = addMesh(leg, new THREE.SphereGeometry(0.065, 9, 6), furDark, [0, -0.29, 0.045], `war-room-cat-paw-${prefix}`);
    paw.scale.set(1.05, 0.58, 1.28);
    model.add(leg);
    legs.push(leg);
  }

  const tailPivot = new THREE.Group();
  tailPivot.name = 'war-room-cat-tail-pivot';
  tailPivot.position.set(0.2, 0.4, -0.48);
  model.add(tailPivot);
  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.15, 0.06, -0.2),
    new THREE.Vector3(0.26, 0.2, -0.38),
    new THREE.Vector3(0.18, 0.42, -0.5),
  ]);
  const tail = addMesh(tailPivot, new THREE.TubeGeometry(tailCurve, 12, 0.052, 7, false), furDark, [0, 0, 0], 'war-room-cat-tail');
  tail.castShadow = true;

  group.userData.refs = { model, body, chest, headPivot, eyes, legs, tailPivot };
  return group;
}

function inferTowardBoard(root) {
  const fireplaceZ = Number(root?.getObjectByName?.('war-room-fireplace')?.position?.z);
  if (Number.isFinite(fireplaceZ) && Math.abs(fireplaceZ) > 0.25) return fireplaceZ < 0 ? 1 : -1;
  return 1;
}

function chooseRoutine(roll) {
  if (roll < 0.32) return 'observer';
  if (roll < 0.78) return 'sofa-sleeper';
  return 'groomer';
}

function point(x, y, z) {
  return { x, y, z };
}

function resolveSofaTarget(root, state) {
  if (state.sofaTarget) return state.sofaTarget;
  const preferred = root?.getObjectByName?.(`war-room-sofa-${state.side < 0 ? 'left' : 'right'}`);
  const alternate = root?.getObjectByName?.(`war-room-sofa-${state.side < 0 ? 'right' : 'left'}`);
  const sofa = preferred || alternate;
  if (!sofa) {
    state.sofaTarget = point(state.side * 6.0, 0.54, state.towardBoard * 4.7);
    return state.sofaTarget;
  }
  const side = Math.sign(Number(sofa.position.x) || state.side) || state.side;
  state.sofaTarget = point(
    Number(sofa.position.x) - side * 0.12,
    Number(sofa.position.y || 0) + 0.58,
    Number(sofa.position.z) - state.towardBoard * 0.05,
  );
  return state.sofaTarget;
}

function setPosition(group, from, to, amount) {
  const t = smoothstep01(amount);
  group.position.set(
    lerp(from.x, to.x, t),
    lerp(from.y, to.y, t),
    lerp(from.z, to.z, t),
  );
  group.rotation.y = headingTo(from.x, from.z, to.x, to.z, group.rotation.y);
}

function setAwakePose(refs, now, { walking = false, sitting = false, grooming = false } = {}) {
  const { model, body, chest, headPivot, eyes, legs, tailPivot } = refs;
  model.rotation.set(0, 0, 0);
  model.position.y = 0;
  body.position.y = sitting ? 0.32 : 0.39;
  body.scale.y = 0.82;
  chest.position.y = sitting ? 0.42 : 0.47;
  chest.rotation.x = sitting ? -0.12 : 0;
  headPivot.position.y = sitting ? 0.58 : 0.64;
  headPivot.rotation.x = grooming ? 0.42 + Math.sin(now * 0.004) * 0.08 : -0.04;
  headPivot.rotation.z = grooming ? Math.sin(now * 0.0032) * 0.12 : 0;
  for (const eye of eyes) eye.scale.y = 1.08;

  const gait = Math.sin(now * 0.0095);
  legs.forEach((leg, index) => {
    leg.rotation.x = walking ? gait * (index % 2 === 0 ? 0.46 : -0.46) : sitting ? (index < 2 ? -0.52 : 0.38) : 0;
    leg.rotation.z = grooming && index === 0 ? -0.72 + Math.sin(now * 0.006) * 0.2 : 0;
  });
  tailPivot.rotation.y = Math.sin(now * 0.0018) * (walking ? 0.28 : 0.42);
  tailPivot.rotation.x = sitting ? 0.24 : 0;
}

function setSleepingPose(refs, now) {
  const { model, body, chest, headPivot, eyes, legs, tailPivot } = refs;
  const breathe = Math.sin(now * 0.0017) * 0.012;
  model.rotation.set(0, 0, -0.04);
  model.position.y = -0.09;
  body.position.y = 0.33;
  body.scale.y = 0.82 + breathe;
  chest.position.y = 0.36;
  chest.rotation.x = 0.24;
  headPivot.position.y = 0.43;
  headPivot.rotation.set(0.35, 0, 0.22);
  for (const eye of eyes) eye.scale.y = 0.08;
  legs.forEach((leg, index) => {
    leg.rotation.x = index < 2 ? -0.92 : 0.82;
    leg.rotation.z = index % 2 === 0 ? -0.22 : 0.22;
  });
  tailPivot.rotation.x = 0.56;
  tailPivot.rotation.y = -0.72 + Math.sin(now * 0.0011) * 0.04;
}

function faceBoard(cat, state) {
  cat.rotation.y = headingTo(cat.position.x, cat.position.z, 0, state.towardBoard * 0.15, cat.rotation.y);
}

function applyObserver(root, state, elapsed, now) {
  const cat = state.cat;
  const watch = point(state.side * 4.72, FLOOR_Y, state.towardBoard * 1.78);
  if (elapsed < 7_000) {
    setPosition(cat, state.entry, watch, elapsed / 7_000);
    setAwakePose(state.refs, now, { walking: true });
    return 'walking-to-board';
  }

  cat.position.set(watch.x, watch.y, watch.z);
  faceBoard(cat, state);
  const grooming = elapsed > 19_000 && elapsed < 27_000;
  setAwakePose(state.refs, now, { sitting: true, grooming });
  if (!grooming) state.refs.headPivot.rotation.y = Math.sin(now * 0.0007) * 0.16;
  return grooming ? 'grooming-by-board' : 'watching-pieces';
}

function applyGroomer(root, state, elapsed, now) {
  const watch = point(state.side * 5.05, FLOOR_Y, state.towardBoard * 2.5);
  const lounge = point(state.side * 5.9, FLOOR_Y, state.towardBoard * 3.7);
  if (elapsed < 6_500) {
    setPosition(state.cat, state.entry, watch, elapsed / 6_500);
    setAwakePose(state.refs, now, { walking: true });
    return 'wandering-in';
  }
  if (elapsed < 18_000) {
    state.cat.position.set(watch.x, watch.y, watch.z);
    faceBoard(state.cat, state);
    setAwakePose(state.refs, now, { sitting: true, grooming: true });
    return 'grooming';
  }
  if (elapsed < 24_000) {
    setPosition(state.cat, watch, lounge, (elapsed - 18_000) / 6_000);
    setAwakePose(state.refs, now, { walking: true });
    return 'wandering';
  }
  state.cat.position.set(lounge.x, lounge.y, lounge.z);
  faceBoard(state.cat, state);
  setAwakePose(state.refs, now, { sitting: true });
  state.refs.tailPivot.rotation.y += Math.sin(now * 0.0014) * 0.18;
  return 'loafing';
}

function applySofaSleeper(root, state, elapsed, now) {
  const watch = point(state.side * 4.8, FLOOR_Y, state.towardBoard * 1.95);
  const sofa = resolveSofaTarget(root, state);
  if (elapsed < 6_500) {
    setPosition(state.cat, state.entry, watch, elapsed / 6_500);
    setAwakePose(state.refs, now, { walking: true });
    return 'walking-to-board';
  }
  if (elapsed < 15_000) {
    state.cat.position.set(watch.x, watch.y, watch.z);
    faceBoard(state.cat, state);
    setAwakePose(state.refs, now, { sitting: true });
    state.refs.headPivot.rotation.y = Math.sin(now * 0.0009) * 0.18;
    return 'watching-pieces';
  }
  if (elapsed < 23_000) {
    setPosition(state.cat, watch, point(sofa.x, FLOOR_Y, sofa.z), (elapsed - 15_000) / 8_000);
    setAwakePose(state.refs, now, { walking: true });
    return 'walking-to-sofa';
  }
  if (elapsed < 25_000) {
    const t = smoothstep01((elapsed - 23_000) / 2_000);
    const floorTarget = point(sofa.x, FLOOR_Y, sofa.z);
    state.cat.position.set(
      sofa.x,
      lerp(FLOOR_Y, sofa.y, t) + Math.sin(Math.PI * t) * 0.34,
      sofa.z,
    );
    state.cat.rotation.y = headingTo(floorTarget.x, floorTarget.z, sofa.x, sofa.z + state.towardBoard, state.cat.rotation.y);
    setAwakePose(state.refs, now, { walking: false });
    return 'jumping-on-sofa';
  }

  state.cat.position.set(sofa.x, sofa.y, sofa.z);
  state.cat.rotation.y = -state.side * Math.PI / 2;
  if (elapsed < 31_000) {
    setAwakePose(state.refs, now, { sitting: true, grooming: elapsed > 27_000 });
    return elapsed > 27_000 ? 'nesting' : 'settling-on-sofa';
  }
  setSleepingPose(state.refs, now);
  return 'sleeping-on-sofa';
}

export function installWarRoomCatAmbient(root, {
  random = Math.random,
  now = 0,
} = {}) {
  if (!root || catStateCache.has(root)) return 0;

  const appearanceRoll = clamp01(random());
  if (appearanceRoll >= WAR_ROOM_CAT_APPEARANCE_CHANCE) {
    const absent = { present: false, appearanceRoll };
    catStateCache.set(root, absent);
    root.userData ||= {};
    root.userData.warRoomCatAmbient = WAR_ROOM_CAT_AMBIENT_VERSION;
    root.userData.warRoomCatPresent = false;
    root.userData.warRoomCatAppearanceRoll = appearanceRoll;
    return 0;
  }

  const routineRoll = clamp01(random());
  const sideRoll = clamp01(random());
  const routine = chooseRoutine(routineRoll);
  const side = sideRoll < 0.5 ? -1 : 1;
  const towardBoard = inferTowardBoard(root);
  const cat = createCat();
  const entry = point(side * 7.15, FLOOR_Y, towardBoard * 5.85);
  cat.position.set(entry.x, entry.y, entry.z);
  cat.rotation.y = headingTo(entry.x, entry.z, side * 4.9, towardBoard * 2, 0);
  root.add(cat);

  const state = {
    present: true,
    cat,
    refs: cat.userData.refs,
    routine,
    side,
    towardBoard,
    entry,
    startedAt: Number(now) || 0,
    sofaTarget: null,
  };
  catStateCache.set(root, state);

  root.userData ||= {};
  root.userData.warRoomCatAmbient = WAR_ROOM_CAT_AMBIENT_VERSION;
  root.userData.warRoomCatPresent = true;
  root.userData.warRoomCatRoutine = routine;
  root.userData.warRoomCatSide = side < 0 ? 'left' : 'right';
  root.userData.warRoomCatAppearanceRoll = appearanceRoll;
  root.userData.warRoomCatRoutineRoll = routineRoll;
  root.userData.warRoomCatBehavior = 'entering';
  return 1;
}

export function applyWarRoomCatAmbient(root, {
  now = 0,
  reducedMotion = false,
} = {}) {
  const state = catStateCache.get(root);
  if (!state?.present || !state.cat?.parent) return 0;
  const elapsed = Math.max(0, Number(now) - state.startedAt);

  let behavior;
  if (reducedMotion) {
    const watch = point(state.side * 4.72, FLOOR_Y, state.towardBoard * 1.78);
    state.cat.position.set(watch.x, watch.y, watch.z);
    faceBoard(state.cat, state);
    setAwakePose(state.refs, 0, { sitting: true });
    behavior = 'quietly-watching-pieces';
  } else if (state.routine === 'sofa-sleeper') {
    behavior = applySofaSleeper(root, state, elapsed, Number(now) || 0);
  } else if (state.routine === 'groomer') {
    behavior = applyGroomer(root, state, elapsed, Number(now) || 0);
  } else {
    behavior = applyObserver(root, state, elapsed, Number(now) || 0);
  }

  root.userData.warRoomCatBehavior = behavior;
  state.cat.userData.warRoomCatBehavior = behavior;
  return 1;
}

export function getWarRoomCatAmbientState(root) {
  const state = catStateCache.get(root);
  if (!state) return null;
  return {
    present: Boolean(state.present),
    routine: state.routine || null,
    side: state.side || null,
    behavior: root?.userData?.warRoomCatBehavior || null,
  };
}
