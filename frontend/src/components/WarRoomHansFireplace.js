import * as THREE from 'three';

export const HANS_FIREPLACE_ODDS = 10;
export const HANS_FIREPLACE_START_DELAY_S = 12;

const HANS_FIREPLACE_VERSION = 'hans-hearthkeeper-v1';
const HANS_ROUTINE_DURATION_S = 33;

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

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function reducedMotionRequested() {
  try {
    return Boolean(globalThis?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  } catch {
    return false;
  }
}

function makeMaterial(color, options = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: options.metalness ?? 0.04,
    roughness: options.roughness ?? 0.68,
    clearcoat: options.clearcoat ?? 0.08,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.4,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
  });
}

function addMesh(parent, geometry, material, position, rotation = [0, 0, 0], name = '') {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (name) mesh.name = name;
  parent.add(mesh);
  return mesh;
}

function addLog(parent, position, rotationZ = Math.PI / 2, name = '') {
  const bark = makeMaterial(0x4b2a17, { roughness: 0.94, clearcoat: 0.01 });
  const cut = makeMaterial(0xc18a55, { roughness: 0.86, clearcoat: 0.02 });
  const log = new THREE.Group();
  log.name = name;
  log.position.set(...position);
  log.rotation.z = rotationZ;
  addMesh(log, new THREE.CylinderGeometry(0.105, 0.12, 0.78, 10), bark, [0, 0, 0]);
  addMesh(log, new THREE.CylinderGeometry(0.106, 0.106, 0.012, 10), cut, [0, 0.396, 0]);
  addMesh(log, new THREE.CylinderGeometry(0.106, 0.106, 0.012, 10), cut, [0, -0.396, 0]);
  parent.add(log);
  return log;
}

function installHearthKit(fireplace, towardBoard, coarsePointer) {
  const existing = fireplace.getObjectByName?.('war-room-hans-hearth-kit');
  if (existing) return existing.userData.refs;

  const side = Math.sign(fireplace.position.x || -1) || -1;
  const kit = new THREE.Group();
  kit.name = 'war-room-hans-hearth-kit';
  kit.userData.warRoomHansHearthKit = HANS_FIREPLACE_VERSION;
  const floorY = -0.3;
  const frontZ = towardBoard * 0.72;

  const basket = new THREE.Group();
  basket.name = 'war-room-hearth-log-basket';
  basket.position.set(side * 1.62, floorY + 0.17, frontZ);
  basket.rotation.y = side * towardBoard * -0.05;
  const wicker = makeMaterial(0x6d421f, { roughness: 0.92, clearcoat: 0.03 });
  const wickerDark = makeMaterial(0x3d2414, { roughness: 0.96, clearcoat: 0.01 });
  addMesh(basket, new THREE.BoxGeometry(0.84, 0.08, 0.58), wickerDark, [0, -0.1, 0]);
  for (const x of [-0.38, -0.19, 0, 0.19, 0.38]) {
    addMesh(basket, new THREE.BoxGeometry(0.055, 0.48, 0.055), wicker, [x, 0.08, -0.27], [0.08, 0, x * 0.06]);
    addMesh(basket, new THREE.BoxGeometry(0.055, 0.48, 0.055), wicker, [x, 0.08, 0.27], [-0.08, 0, x * -0.06]);
  }
  for (const z of [-0.25, 0.25]) {
    addMesh(basket, new THREE.BoxGeometry(0.78, 0.05, 0.05), wickerDark, [0, -0.02, z]);
    addMesh(basket, new THREE.BoxGeometry(0.78, 0.05, 0.05), wickerDark, [0, 0.16, z]);
  }
  const handle = addMesh(
    basket,
    new THREE.TorusGeometry(0.46, 0.03, 7, coarsePointer ? 14 : 24, Math.PI),
    wicker,
    [0, 0.22, 0],
    [0, Math.PI / 2, 0],
  );
  handle.rotation.z = Math.PI / 2;

  const logCount = coarsePointer ? 3 : 5;
  let basketTopLog = null;
  for (let index = 0; index < logCount; index += 1) {
    const log = addLog(
      basket,
      [
        (index % 2 ? 0.12 : -0.12) + (index - 2) * 0.035,
        0.05 + Math.floor(index / 2) * 0.16,
        (index % 3 - 1) * 0.08,
      ],
      Math.PI / 2 + (index % 2 ? 0.12 : -0.1),
      index === logCount - 1 ? 'war-room-hearth-basket-top-log' : '',
    );
    if (index === logCount - 1) basketTopLog = log;
  }
  kit.add(basket);

  const tools = new THREE.Group();
  tools.name = 'war-room-hearth-tool-stand';
  tools.position.set(side * 2.28, floorY, frontZ - towardBoard * 0.04);
  const iron = makeMaterial(0x191817, { metalness: 0.76, roughness: 0.4, clearcoat: 0.12 });
  const brass = makeMaterial(0xa97428, { metalness: 0.82, roughness: 0.24, clearcoat: 0.32 });
  addMesh(tools, new THREE.CylinderGeometry(0.24, 0.31, 0.08, 14), iron, [0, 0.04, 0]);
  addMesh(tools, new THREE.CylinderGeometry(0.035, 0.045, 1.0, 10), iron, [0, 0.55, 0]);
  addMesh(tools, new THREE.TorusGeometry(0.2, 0.024, 6, 16), brass, [0, 0.98, 0], [Math.PI / 2, 0, 0]);

  const poker = new THREE.Group();
  poker.name = 'war-room-hearth-poker';
  poker.position.set(-side * 0.14, 0.57, 0.05);
  poker.rotation.z = side * 0.08;
  addMesh(poker, new THREE.CylinderGeometry(0.018, 0.018, 1.05, 8), iron, [0, 0, 0]);
  addMesh(poker, new THREE.SphereGeometry(0.045, 8, 6), brass, [0, 0.56, 0]);
  tools.add(poker);

  const shovel = new THREE.Group();
  shovel.name = 'war-room-hearth-shovel';
  shovel.position.set(side * 0.15, 0.55, 0.02);
  shovel.rotation.z = -side * 0.08;
  addMesh(shovel, new THREE.CylinderGeometry(0.018, 0.018, 0.95, 8), iron, [0, 0.06, 0]);
  addMesh(shovel, new THREE.BoxGeometry(0.21, 0.24, 0.035), iron, [0, -0.47, 0]);
  addMesh(shovel, new THREE.SphereGeometry(0.042, 8, 6), brass, [0, 0.56, 0]);
  tools.add(shovel);

  if (!coarsePointer) {
    const tongs = new THREE.Group();
    tongs.name = 'war-room-hearth-tongs';
    tongs.position.set(0, 0.54, -0.12);
    for (const dx of [-0.035, 0.035]) {
      addMesh(tongs, new THREE.CylinderGeometry(0.013, 0.013, 0.95, 7), iron, [dx, 0.03, 0], [0, 0, dx * 0.9]);
    }
    addMesh(tongs, new THREE.TorusGeometry(0.07, 0.014, 6, 12, Math.PI), iron, [0, 0.52, 0], [0, 0, Math.PI / 2]);
    tools.add(tongs);
  }
  kit.add(tools);

  const addedLog = addLog(
    kit,
    [side * 0.06, 0.06, towardBoard * 0.34],
    Math.PI / 2 + side * 0.16,
    'war-room-hans-hearth-added-log',
  );
  addedLog.visible = false;

  fireplace.add(kit);
  const refs = { kit, basket, basketTopLog, tools, poker, addedLog, side };
  kit.userData.refs = refs;
  return refs;
}

function buildArm(coat, skin, side) {
  const arm = new THREE.Group();
  arm.position.x = side * 0.42;
  addMesh(arm, new THREE.CylinderGeometry(0.09, 0.075, 0.62, 9), coat, [0, -0.3, 0]);
  addMesh(arm, new THREE.SphereGeometry(0.085, 10, 8), skin, [0, -0.64, 0.01]);
  return arm;
}

function buildHans(towardBoard) {
  const hans = new THREE.Group();
  hans.name = 'war-room-hans-butler';
  hans.userData.warRoomCharacter = 'Hans';
  hans.userData.warRoomRole = 'Matthias butler and hearth keeper';

  const black = makeMaterial(0x0e0f11, { roughness: 0.62, clearcoat: 0.09 });
  const blackSoft = makeMaterial(0x17191c, { roughness: 0.72, clearcoat: 0.04 });
  const white = makeMaterial(0xe8e1d4, { roughness: 0.74, clearcoat: 0.03 });
  const skin = makeMaterial(0xc89b77, { roughness: 0.76, clearcoat: 0.02 });
  const silver = makeMaterial(0xbeb8ad, { roughness: 0.82, clearcoat: 0.03 });
  const brass = makeMaterial(0xb67b28, { metalness: 0.78, roughness: 0.24, clearcoat: 0.36 });

  const leftLeg = new THREE.Group();
  const rightLeg = new THREE.Group();
  leftLeg.position.set(-0.17, 0.82, 0);
  rightLeg.position.set(0.17, 0.82, 0);
  addMesh(leftLeg, new THREE.CylinderGeometry(0.095, 0.085, 0.72, 9), blackSoft, [0, -0.34, 0]);
  addMesh(rightLeg, new THREE.CylinderGeometry(0.095, 0.085, 0.72, 9), blackSoft, [0, -0.34, 0]);
  addMesh(leftLeg, new THREE.BoxGeometry(0.2, 0.12, 0.38), black, [0, -0.74, -towardBoard * 0.07]);
  addMesh(rightLeg, new THREE.BoxGeometry(0.2, 0.12, 0.38), black, [0, -0.74, -towardBoard * 0.07]);
  hans.add(leftLeg, rightLeg);

  const torso = new THREE.Group();
  torso.name = 'war-room-hans-torso';
  torso.position.y = 1.36;
  addMesh(torso, new THREE.CylinderGeometry(0.31, 0.42, 0.98, 12), black, [0, 0, 0]);
  addMesh(torso, new THREE.BoxGeometry(0.24, 0.74, 0.035), white, [0, 0.03, towardBoard * 0.31]);
  addMesh(torso, new THREE.BoxGeometry(0.18, 0.08, 0.05), blackSoft, [0, 0.34, towardBoard * 0.35], [0, 0, Math.PI / 4]);
  addMesh(torso, new THREE.BoxGeometry(0.18, 0.08, 0.05), blackSoft, [0, 0.34, towardBoard * 0.35], [0, 0, -Math.PI / 4]);
  addMesh(torso, new THREE.BoxGeometry(0.24, 0.82, 0.08), black, [-0.16, -0.5, -towardBoard * 0.19], [0.08 * towardBoard, 0, 0]);
  addMesh(torso, new THREE.BoxGeometry(0.24, 0.82, 0.08), black, [0.16, -0.5, -towardBoard * 0.19], [0.08 * towardBoard, 0, 0]);
  addMesh(torso, new THREE.TorusGeometry(0.19, 0.014, 6, 18, Math.PI * 0.82), brass, [0.15, -0.05, towardBoard * 0.35], [0, 0, Math.PI * 0.18]);
  hans.add(torso);

  const leftArm = buildArm(black, skin, -1);
  const rightArm = buildArm(black, skin, 1);
  leftArm.position.y = 1.62;
  rightArm.position.y = 1.62;
  hans.add(leftArm, rightArm);

  const head = new THREE.Group();
  head.name = 'war-room-hans-head';
  head.position.y = 2.12;
  addMesh(head, new THREE.SphereGeometry(0.29, 16, 12), skin, [0, 0, 0]);
  addMesh(head, new THREE.SphereGeometry(0.075, 10, 8), skin, [0, -0.02, towardBoard * 0.28]);
  addMesh(head, new THREE.SphereGeometry(0.16, 12, 8), silver, [-0.22, 0.13, -towardBoard * 0.03]);
  addMesh(head, new THREE.SphereGeometry(0.16, 12, 8), silver, [0.22, 0.13, -towardBoard * 0.03]);
  addMesh(head, new THREE.BoxGeometry(0.16, 0.032, 0.032), silver, [-0.11, 0.055, towardBoard * 0.27], [0, 0, -0.08]);
  addMesh(head, new THREE.BoxGeometry(0.16, 0.032, 0.032), silver, [0.11, 0.055, towardBoard * 0.27], [0, 0, 0.08]);
  for (const x of [-0.105, 0.105]) {
    addMesh(head, new THREE.SphereGeometry(0.027, 8, 6), black, [x, 0.015, towardBoard * 0.285]);
  }
  addMesh(head, new THREE.BoxGeometry(0.2, 0.045, 0.035), silver, [0, -0.11, towardBoard * 0.29], [0, 0, -0.03]);
  hans.add(head);

  const carriedLog = addLog(hans, [0.52, 1.05, towardBoard * 0.22], Math.PI / 2 + 0.06, 'war-room-hans-carried-log');
  carriedLog.scale.setScalar(0.72);
  carriedLog.visible = false;

  const carriedPoker = new THREE.Group();
  carriedPoker.name = 'war-room-hans-carried-poker';
  carriedPoker.position.set(0.52, 1.08, towardBoard * 0.22);
  const pokerIron = makeMaterial(0x171717, { metalness: 0.78, roughness: 0.38 });
  addMesh(carriedPoker, new THREE.CylinderGeometry(0.017, 0.017, 1.12, 7), pokerIron, [0, -0.08, 0], [0, 0, Math.PI / 2]);
  carriedPoker.visible = false;
  hans.add(carriedPoker);

  hans.userData.refs = { leftLeg, rightLeg, torso, leftArm, rightArm, head, carriedLog, carriedPoker };
  return hans;
}

export function shouldScheduleHansFireplace(randomValue, odds = HANS_FIREPLACE_ODDS) {
  const denominator = Math.max(1, Math.floor(Number(odds) || HANS_FIREPLACE_ODDS));
  const roll = clamp01(randomValue);
  return roll < (1 / denominator);
}

function resetHansFireplaceFrame(target) {
  const frame = target || {};
  frame.phase = 'waiting';
  frame.active = false;
  frame.complete = false;
  frame.fireScale = 1;
  frame.hansVisible = false;
  frame.hansX = 3.9;
  frame.stride = 0;
  frame.lean = 0;
  frame.rightArm = 0;
  frame.leftArm = 0;
  frame.headNod = 0;
  frame.carryLog = false;
  frame.removeBasketLog = false;
  frame.showAddedLog = false;
  frame.carryPoker = false;
  frame.stoke = 0;
  return frame;
}

export function writeHansFireplaceFrame(target, elapsedSeconds) {
  const frame = resetHansFireplaceFrame(target);
  const elapsed = Number(elapsedSeconds) || 0;
  const t = elapsed - HANS_FIREPLACE_START_DELAY_S;
  if (t < 0) return frame;

  if (t >= HANS_ROUTINE_DURATION_S) {
    frame.phase = 'complete';
    frame.complete = true;
    frame.removeBasketLog = true;
    frame.showAddedLog = true;
    return frame;
  }

  frame.active = true;
  if (t < 5) {
    const p = smoothstep01(t / 5);
    frame.phase = 'fire-dimming';
    frame.fireScale = lerp(1, 0.26, p);
    return frame;
  }
  if (t < 10) {
    const local = t - 5;
    const p = smoothstep01(local / 5);
    frame.phase = 'walk-to-basket';
    frame.fireScale = 0.26;
    frame.hansVisible = true;
    frame.hansX = lerp(3.9, 1.95, p);
    frame.stride = Math.sin(local * 5.8) * 0.3;
    return frame;
  }
  if (t < 12) {
    const p = smoothstep01((t - 10) / 2);
    frame.phase = 'take-log';
    frame.fireScale = 0.26;
    frame.hansVisible = true;
    frame.hansX = 1.95;
    frame.lean = Math.sin(p * Math.PI) * 0.34;
    frame.rightArm = -Math.sin(p * Math.PI) * 1.0;
    frame.carryLog = p > 0.55;
    frame.removeBasketLog = p > 0.55;
    return frame;
  }
  if (t < 15) {
    const local = t - 12;
    const p = smoothstep01(local / 3);
    frame.phase = 'carry-log';
    frame.fireScale = 0.26;
    frame.hansVisible = true;
    frame.hansX = lerp(1.95, 0.9, p);
    frame.stride = Math.sin(local * 5.6) * 0.23;
    frame.carryLog = true;
    frame.removeBasketLog = true;
    frame.rightArm = -0.42;
    return frame;
  }
  if (t < 17) {
    const p = smoothstep01((t - 15) / 2);
    frame.phase = 'place-log';
    frame.fireScale = 0.26;
    frame.hansVisible = true;
    frame.hansX = 0.9;
    frame.lean = Math.sin(p * Math.PI) * 0.42;
    frame.rightArm = -0.7 - p * 0.45;
    frame.carryLog = p < 0.72;
    frame.removeBasketLog = true;
    frame.showAddedLog = p >= 0.72;
    return frame;
  }
  if (t < 19) {
    const p = smoothstep01((t - 17) / 2);
    frame.phase = 'take-poker';
    frame.fireScale = 0.26;
    frame.hansVisible = true;
    frame.hansX = lerp(0.9, 1.18, p);
    frame.lean = Math.sin(p * Math.PI) * 0.18;
    frame.rightArm = -0.35 - Math.sin(p * Math.PI) * 0.65;
    frame.removeBasketLog = true;
    frame.showAddedLog = true;
    frame.carryPoker = p > 0.48;
    return frame;
  }
  if (t < 24) {
    const local = t - 19;
    const p = smoothstep01(local / 5);
    const stoke = Math.sin(local * 7.2) * 0.5;
    frame.phase = 'stoke-fire';
    frame.hansVisible = true;
    frame.hansX = 0.92;
    frame.fireScale = lerp(0.26, 1.08, smoothstep01(Math.max(0, (p - 0.25) / 0.75)));
    frame.lean = 0.18 + Math.sin(local * 3.6) * 0.05;
    frame.rightArm = -0.72 + stoke;
    frame.leftArm = 0.18 - stoke * 0.18;
    frame.removeBasketLog = true;
    frame.showAddedLog = true;
    frame.carryPoker = true;
    frame.stoke = stoke;
    return frame;
  }
  if (t < 25.5) {
    const p = smoothstep01((t - 24) / 1.5);
    frame.phase = 'return-poker';
    frame.fireScale = lerp(1.08, 1, p);
    frame.hansVisible = true;
    frame.hansX = lerp(0.92, 1.18, p);
    frame.rightArm = lerp(-0.45, -0.1, p);
    frame.removeBasketLog = true;
    frame.showAddedLog = true;
    frame.carryPoker = p < 0.74;
    return frame;
  }
  if (t < 27) {
    const p = smoothstep01((t - 25.5) / 1.5);
    frame.phase = 'satisfied';
    frame.fireScale = 1;
    frame.hansVisible = true;
    frame.hansX = 1.18;
    frame.headNod = Math.sin(p * Math.PI) * 0.16;
    frame.rightArm = -0.08;
    frame.removeBasketLog = true;
    frame.showAddedLog = true;
    return frame;
  }

  const local = t - 27;
  const p = smoothstep01(local / 6);
  frame.phase = 'leave';
  frame.fireScale = 1;
  frame.hansVisible = true;
  frame.hansX = lerp(1.18, 4.15, p);
  frame.stride = Math.sin(local * 5.8) * 0.3;
  frame.removeBasketLog = true;
  frame.showAddedLog = true;
  return frame;
}

export function hansFireplaceFrame(elapsedSeconds) {
  return writeHansFireplaceFrame({}, elapsedSeconds);
}

function applyFrame(refs, frame, towardBoard) {
  const {
    fireplace, hans, fireCore, fireLight, fireCoreBaseScale, fireLightBaseDistance,
    basketTopLog, addedLog, standPoker, side,
  } = refs;
  if (basketTopLog) basketTopLog.visible = !frame.removeBasketLog;
  if (addedLog) addedLog.visible = frame.showAddedLog;

  hans.visible = frame.hansVisible;
  if (frame.hansVisible) {
    hans.position.x = side * frame.hansX;
    hans.position.y = -0.34;
    hans.position.z = towardBoard * 1.16;
    hans.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    const body = hans.userData.refs;
    body.leftLeg.rotation.x = frame.stride;
    body.rightLeg.rotation.x = -frame.stride;
    body.leftArm.rotation.x = frame.leftArm - frame.stride * 0.55;
    body.rightArm.rotation.x = frame.rightArm + frame.stride * 0.35;
    body.torso.rotation.x = towardBoard * frame.lean * 0.35;
    body.head.rotation.x = towardBoard * (frame.headNod - frame.lean * 0.12);
    body.carriedLog.visible = frame.carryLog;
    body.carriedPoker.visible = frame.carryPoker;
    body.carriedPoker.rotation.z = frame.stoke * 0.22;
  }
  if (standPoker) standPoker.visible = !frame.carryPoker;

  if (frame.active) {
    const widthScale = 0.74 + frame.fireScale * 0.26;
    fireCore.scale.set(
      fireCoreBaseScale.x * widthScale,
      fireCoreBaseScale.y * frame.fireScale,
      fireCoreBaseScale.z * widthScale,
    );
    const baseIntensity = Number(fireLight.userData?.baseWarRoomIntensity || fireLight.intensity || 1);
    const lightScale = 0.22 + frame.fireScale * 0.78;
    fireLight.intensity = baseIntensity * lightScale;
    fireLight.distance = fireLightBaseDistance * (0.6 + frame.fireScale * 0.4);

    // CastleArchitecture owns the organic fire flicker and creates this bounce
    // light lazily. Cache it after the first successful lookup so Hans does not
    // traverse the fireplace subtree on every late render.
    const bounce = refs.bounce || fireplace.getObjectByName?.('war-room-fire-bounce-light');
    if (bounce) {
      refs.bounce = bounce;
      if (bounce.userData.hansBaseIntensity == null) {
        bounce.userData.hansBaseIntensity = frame.fireScale > 0.95 ? bounce.intensity : 1.15;
      }
      bounce.intensity = Number(bounce.userData.hansBaseIntensity || 1.15) * (0.18 + frame.fireScale * 0.82);
    }
  }

  if (frame.complete) {
    fireCore.scale.copy(fireCoreBaseScale);
    fireLight.distance = fireLightBaseDistance;
    const bounce = refs.bounce || fireplace.getObjectByName?.('war-room-fire-bounce-light');
    if (bounce) refs.bounce = bounce;
    if (bounce?.userData?.hansBaseIntensity != null) bounce.intensity = bounce.userData.hansBaseIntensity;
  }
}

function createLateRenderDriver() {
  const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  material.colorWrite = false;
  const driver = new THREE.Mesh(new THREE.PlaneGeometry(0.002, 0.002), material);
  driver.name = 'war-room-hans-fireplace-driver';
  driver.frustumCulled = false;
  driver.renderOrder = 1000;
  driver.castShadow = false;
  driver.receiveShadow = false;
  return driver;
}

export function installWarRoomHansFireplaceRoutine(group, {
  towardBoard,
  coarsePointer = false,
  randomValue = Math.random(),
  forceEvent = false,
  reducedMotion = reducedMotionRequested(),
} = {}) {
  if (!group || !Number.isFinite(towardBoard)) return 0;
  const fireplace = group.getObjectByName?.('war-room-fireplace');
  if (!fireplace) return 0;
  if (fireplace.userData.warRoomHansFireplaceRoutine === HANS_FIREPLACE_VERSION) return 0;

  const kitRefs = installHearthKit(fireplace, towardBoard, coarsePointer);
  const eligible = !coarsePointer && !reducedMotion;
  const selected = eligible && (forceEvent || shouldScheduleHansFireplace(randomValue));
  fireplace.userData.warRoomHansFireplaceRoutine = HANS_FIREPLACE_VERSION;
  fireplace.userData.warRoomHansFireplaceOdds = `1/${HANS_FIREPLACE_ODDS}`;
  fireplace.userData.warRoomHansEventSelected = selected;
  group.userData.warRoomHansFireplaceRoutine = HANS_FIREPLACE_VERSION;

  if (coarsePointer) return 1;

  // Desktop keeps the same geometry whether this mount wins the 1/10 roll or
  // not. That keeps scene cost/tests deterministic; selection only arms motion.
  const hans = buildHans(towardBoard);
  hans.visible = false;
  fireplace.add(hans);
  const driver = createLateRenderDriver();
  driver.position.set(0, 0.4, towardBoard * 0.4);
  driver.userData.warRoomHansRoutine = HANS_FIREPLACE_VERSION;
  driver.userData.warRoomHansSelected = selected;
  fireplace.add(driver);

  if (!selected) {
    driver.userData.warRoomHansPhase = reducedMotion ? 'reduced-motion' : 'not-selected';
    driver.onBeforeRender = () => {};
    return 2;
  }

  const fireCore = fireplace.getObjectByName?.('war-room-fire-core');
  const fireLight = fireplace.getObjectByName?.('war-room-fire-light');
  if (!fireCore || !fireLight) {
    driver.userData.warRoomHansPhase = 'fire-unavailable';
    driver.onBeforeRender = () => {};
    return 2;
  }

  const startedAt = nowMs();
  const frameScratch = {};
  const refs = {
    fireplace,
    hans,
    fireCore,
    fireLight,
    fireCoreBaseScale: fireCore.scale.clone(),
    fireLightBaseDistance: Number(fireLight.distance || 8.8),
    basketTopLog: kitRefs.basketTopLog,
    addedLog: kitRefs.addedLog,
    standPoker: kitRefs.poker,
    side: kitRefs.side,
    bounce: null,
  };
  driver.userData.warRoomHansStartDelaySeconds = HANS_FIREPLACE_START_DELAY_S;
  driver.userData.warRoomHansFrameHotPath = 'scratch-writer-v1';
  driver.onBeforeRender = () => {
    const frame = writeHansFireplaceFrame(frameScratch, (nowMs() - startedAt) / 1000);
    applyFrame(refs, frame, towardBoard);
    driver.userData.warRoomHansPhase = frame.phase;
    if (frame.complete) {
      hans.visible = false;
      driver.userData.warRoomHansCompleted = true;
      driver.onBeforeRender = () => {};
    }
  };
  return 2;
}
