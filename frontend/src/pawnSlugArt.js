import * as THREE from 'three';

const MAT = Object.freeze({
  black: 0x17191f,
  black2: 0x252a32,
  brass: 0xc9a24a,
  brass2: 0x8b6b2f,
  ivory: 0xe7ddc8,
  red: 0x8c2735,
  red2: 0x4f1720,
  steel: 0x66717e,
  steel2: 0x3f4852,
  muzzle: 0xffd26c,
  enemy: 0x30343b,
  enemyAccent: 0xa14739,
  smoke: 0x7f8790,
});

function std(color, roughness = 0.72, metalness = 0.06, emissive = 0x000000) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive });
}

function mesh(geometry, material, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0 } = {}) {
  const node = new THREE.Mesh(geometry, material);
  node.position.set(x, y, z);
  node.rotation.set(rx, ry, rz);
  node.castShadow = true;
  node.receiveShadow = true;
  return node;
}

function roundedBox(w, h, d, r = 0.08, color = MAT.black) {
  const shape = new THREE.Shape();
  const hw = w / 2;
  const hh = h / 2;
  shape.moveTo(-hw + r, -hh);
  shape.lineTo(hw - r, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + r);
  shape.lineTo(hw, hh - r);
  shape.quadraticCurveTo(hw, hh, hw - r, hh);
  shape.lineTo(-hw + r, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - r);
  shape.lineTo(-hw, -hh + r);
  shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false, steps: 1 });
  geometry.center();
  return mesh(geometry, std(color));
}

function makeEye(x, y, z, angry = false) {
  const group = new THREE.Group();
  const eye = mesh(new THREE.SphereGeometry(0.055, 10, 8), std(0xf4f0e7, 0.8), { x, y, z });
  const pupil = mesh(new THREE.SphereGeometry(0.025, 8, 6), std(0x111111, 0.8), { x: x + 0.025, y, z: z + 0.045 });
  const brow = mesh(new THREE.BoxGeometry(0.17, 0.035, 0.035), std(MAT.black, 0.85), { x: x + 0.01, y: y + 0.105, z: z + 0.055, rz: angry ? -0.2 : -0.08 });
  group.add(eye, pupil, brow);
  return group;
}

function makeCap() {
  const cap = new THREE.Group();
  const crown = mesh(new THREE.CylinderGeometry(0.31, 0.36, 0.22, 18), std(MAT.black2, 0.55), { y: 0.04 });
  const band = mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.07, 18), std(MAT.brass2, 0.6), { y: -0.07 });
  const visor = mesh(new THREE.BoxGeometry(0.38, 0.045, 0.28), std(MAT.black, 0.45), { x: 0.12, y: -0.1, z: 0.03, rz: -0.08 });
  const badge = mesh(new THREE.SphereGeometry(0.065, 12, 8), std(MAT.brass, 0.35, 0.25), { x: 0.02, y: 0.09, z: 0.31 });
  cap.add(crown, band, visor, badge);
  return cap;
}

function makeGun(kind = 'pistol', friendly = true) {
  const group = new THREE.Group();
  const bodyColor = friendly ? MAT.steel : MAT.enemy;
  const barrelLength = kind === 'panzerfaust' ? 1.15 : kind === 'shotgun' ? 0.92 : kind === 'machinegun' ? 1.02 : 0.58;
  const body = mesh(new THREE.BoxGeometry(barrelLength * 0.68, 0.13, 0.14), std(bodyColor, 0.38, 0.55), { x: barrelLength * 0.16 });
  const barrel = mesh(new THREE.CylinderGeometry(kind === 'panzerfaust' ? 0.1 : 0.045, kind === 'panzerfaust' ? 0.1 : 0.045, barrelLength * 0.64, 10), std(MAT.steel2, 0.3, 0.7), { x: barrelLength * 0.53, rx: 0, ry: 0, rz: -Math.PI / 2 });
  const grip = mesh(new THREE.BoxGeometry(0.12, 0.28, 0.12), std(MAT.black, 0.7), { x: 0, y: -0.16, rz: -0.12 });
  group.add(body, barrel, grip);
  if (kind === 'machinegun') {
    group.add(mesh(new THREE.BoxGeometry(0.18, 0.34, 0.12), std(MAT.brass2, 0.65), { x: 0.1, y: -0.24, rz: 0.08 }));
  }
  if (kind === 'shotgun') {
    group.add(mesh(new THREE.BoxGeometry(0.42, 0.1, 0.16), std(0x5b3925, 0.82), { x: 0.05, y: -0.04 }));
  }
  if (kind === 'panzerfaust') {
    group.add(mesh(new THREE.ConeGeometry(0.18, 0.28, 12), std(MAT.steel2, 0.45, 0.45), { x: barrelLength * 0.92, rz: -Math.PI / 2 }));
  }
  group.userData.muzzleX = barrelLength * 0.9;
  return group;
}

export function createMatthiasSlugModel() {
  const root = new THREE.Group();
  root.name = 'pawn-slug-matthias';

  const shadow = mesh(new THREE.CircleGeometry(0.55, 22), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }), { y: 0.015, rx: -Math.PI / 2 });
  shadow.scale.set(1.15, 0.5, 1);
  root.add(shadow);

  const body = new THREE.Group();
  const base = mesh(new THREE.CylinderGeometry(0.47, 0.57, 0.28, 18), std(MAT.black2, 0.6), { y: 0.28 });
  const torso = mesh(new THREE.CylinderGeometry(0.31, 0.43, 0.68, 18), std(MAT.black, 0.58), { y: 0.72 });
  const belt = mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.1, 18), std(MAT.brass2, 0.45, 0.25), { y: 0.55 });
  body.add(base, torso, belt);
  root.add(body);

  const headRig = new THREE.Group();
  headRig.position.y = 1.27;
  const neck = mesh(new THREE.CylinderGeometry(0.18, 0.23, 0.2, 14), std(MAT.ivory, 0.72), { y: -0.18 });
  const face = mesh(new THREE.SphereGeometry(0.39, 20, 15), std(MAT.ivory, 0.76), { y: 0.06 });
  face.scale.set(0.92, 1, 0.82);
  headRig.add(neck, face, makeEye(0.13, 0.13, 0.28, true));
  const nose = mesh(new THREE.ConeGeometry(0.055, 0.15, 9), std(0xd5c7ac, 0.8), { x: 0.34, y: 0.04, z: 0.12, rz: -Math.PI / 2 });
  headRig.add(nose);
  const mouth = mesh(new THREE.BoxGeometry(0.13, 0.028, 0.025), std(MAT.black, 0.9), { x: 0.2, y: -0.11, z: 0.3, rz: 0.06 });
  headRig.add(mouth);
  const cap = makeCap();
  cap.position.set(0, 0.42, 0.02);
  cap.rotation.z = -0.03;
  headRig.add(cap);
  root.add(headRig);

  const armRig = new THREE.Group();
  armRig.position.set(0.3, 0.92, 0.04);
  const upper = mesh(new THREE.CapsuleGeometry(0.08, 0.32, 5, 10), std(MAT.black2, 0.62), { x: 0.14, y: -0.06, rz: -0.72 });
  const hand = mesh(new THREE.SphereGeometry(0.1, 12, 8), std(MAT.ivory, 0.72), { x: 0.35, y: -0.18, z: 0.02 });
  armRig.add(upper, hand);
  root.add(armRig);

  const gunMount = new THREE.Group();
  gunMount.position.set(0.55, 0.82, 0.03);
  const gun = makeGun('pistol', true);
  gunMount.add(gun);
  root.add(gunMount);

  const bootL = roundedBox(0.32, 0.17, 0.34, 0.05, MAT.black2);
  const bootR = roundedBox(0.32, 0.17, 0.34, 0.05, MAT.black2);
  bootL.position.set(-0.16, 0.09, 0.02);
  bootR.position.set(0.2, 0.09, 0.02);
  root.add(bootL, bootR);

  root.userData.rig = { body, headRig, armRig, gunMount, gun, bootL, bootR, shadow, mouth };
  root.userData.setWeapon = (kind) => {
    gunMount.clear();
    const next = makeGun(kind, true);
    gunMount.add(next);
    root.userData.rig.gun = next;
  };
  root.scale.setScalar(1.02);
  return root;
}

function enemyFace(group, accent = MAT.enemyAccent) {
  group.add(makeEye(0.1, 0.13, 0.25, true));
  group.add(mesh(new THREE.BoxGeometry(0.16, 0.035, 0.03), std(accent, 0.8), { x: 0.19, y: -0.11, z: 0.27, rz: -0.08 }));
}

export function createSlugEnemyModel(type = 'pawn') {
  if (type === 'boss') return createPanzerRookBoss();
  const root = new THREE.Group();
  root.name = `pawn-slug-enemy-${type}`;
  const main = new THREE.Group();
  root.add(main);

  if (type === 'rook') {
    const base = mesh(new THREE.CylinderGeometry(0.52, 0.62, 0.34, 12), std(MAT.enemy, 0.54, 0.22), { y: 0.25 });
    const tower = mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.76, 12), std(MAT.enemy, 0.57, 0.18), { y: 0.78 });
    const crown = mesh(new THREE.BoxGeometry(0.9, 0.25, 0.6), std(MAT.enemy, 0.52, 0.22), { y: 1.23 });
    const barrel = mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.8, 10), std(MAT.steel2, 0.35, 0.55), { x: 0.48, y: 0.95, rz: -Math.PI / 2 });
    main.add(base, tower, crown, barrel);
    root.userData.muzzle = new THREE.Vector3(0.9, 0.95, 0);
  } else {
    const base = mesh(new THREE.CylinderGeometry(0.37, 0.46, 0.25, 16), std(MAT.enemy, 0.65), { y: 0.2 });
    const torso = mesh(new THREE.CylinderGeometry(0.26, 0.35, 0.55, 16), std(MAT.enemy, 0.62), { y: 0.6 });
    const head = mesh(new THREE.SphereGeometry(0.31, 16, 12), std(type === 'knight' ? 0x4b515d : MAT.ivory, 0.72), { y: 1.03 });
    main.add(base, torso, head);
    enemyFace(main);
    if (type === 'knight') {
      const crest = mesh(new THREE.ConeGeometry(0.16, 0.5, 8), std(MAT.enemyAccent, 0.65), { x: -0.08, y: 1.4, rz: 0.25 });
      main.add(crest);
    }
    const gun = makeGun(type === 'knight' ? 'machinegun' : 'pistol', false);
    gun.position.set(0.48, 0.62, 0);
    main.add(gun);
    root.userData.muzzle = new THREE.Vector3(1.1, 0.72, 0);
  }

  const shadow = mesh(new THREE.CircleGeometry(0.48, 18), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }), { y: 0.012, rx: -Math.PI / 2 });
  shadow.scale.set(1.1, 0.45, 1);
  root.add(shadow);
  root.userData.rig = { main, shadow };
  return root;
}

export function createPanzerRookBoss() {
  const root = new THREE.Group();
  root.name = 'pawn-slug-panzer-rook';
  const treadMat = std(0x20252b, 0.7, 0.35);
  const armorMat = std(0x3b4147, 0.48, 0.4);
  const accentMat = std(MAT.enemyAccent, 0.5, 0.22);

  const body = roundedBox(2.4, 0.72, 1.15, 0.12, 0x343a40);
  body.position.y = 0.72;
  root.add(body);
  const treadL = mesh(new THREE.BoxGeometry(2.6, 0.38, 0.23), treadMat, { y: 0.28, z: 0.5 });
  const treadR = mesh(new THREE.BoxGeometry(2.6, 0.38, 0.23), treadMat, { y: 0.28, z: -0.5 });
  root.add(treadL, treadR);
  for (let i = -4; i <= 4; i += 1) {
    const wheelA = mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.12, 12), armorMat, { x: i * 0.26, y: 0.28, z: 0.64, rx: Math.PI / 2 });
    const wheelB = wheelA.clone(); wheelB.position.z = -0.64;
    root.add(wheelA, wheelB);
  }

  const rook = mesh(new THREE.CylinderGeometry(0.68, 0.82, 1.25, 12), armorMat, { y: 1.55 });
  const crown = mesh(new THREE.CylinderGeometry(0.82, 0.82, 0.34, 8), accentMat, { y: 2.26 });
  root.add(rook, crown);
  const turret = new THREE.Group();
  turret.position.set(0, 1.75, 0);
  const barrel = mesh(new THREE.CylinderGeometry(0.11, 0.14, 1.8, 12), std(MAT.steel2, 0.3, 0.6), { x: 0.86, rz: -Math.PI / 2 });
  turret.add(barrel);
  root.add(turret);

  const eye = mesh(new THREE.BoxGeometry(0.34, 0.1, 0.06), new THREE.MeshStandardMaterial({ color: 0xff4d45, emissive: 0x9e160f, emissiveIntensity: 2 }), { x: 0.55, y: 2.05, z: 0.61, rz: -0.12 });
  root.add(eye);
  root.userData.rig = { turret, body, rook, crown, eye };
  root.userData.muzzle = new THREE.Vector3(1.8, 1.75, 0);
  return root;
}

export function createPickupModel(type) {
  const root = new THREE.Group();
  const crate = roundedBox(0.72, 0.55, 0.58, 0.08, type === 'medkit' ? 0x5b6a4c : 0x5a4025);
  crate.position.y = 0.32;
  root.add(crate);
  const badge = mesh(new THREE.BoxGeometry(0.42, 0.16, 0.03), std(type === 'medkit' ? 0xc6d3aa : MAT.brass, 0.62), { y: 0.35, z: 0.31 });
  root.add(badge);
  const symbol = type === 'grenade' ? 'G' : type === 'machinegun' ? 'H' : type === 'shotgun' ? 'S' : type === 'panzerfaust' ? 'R' : '+';
  root.userData.symbol = symbol;
  return root;
}

export function createBulletModel({ enemy = false, explosive = false } = {}) {
  if (explosive) {
    const group = new THREE.Group();
    group.add(mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.34, 10), std(enemy ? MAT.enemyAccent : MAT.steel, 0.4, 0.5), { rz: -Math.PI / 2 }));
    group.add(mesh(new THREE.ConeGeometry(0.1, 0.18, 10), std(enemy ? MAT.enemyAccent : MAT.brass, 0.35, 0.45), { x: 0.24, rz: -Math.PI / 2 }));
    return group;
  }
  return mesh(new THREE.SphereGeometry(enemy ? 0.055 : 0.045, 8, 6), new THREE.MeshBasicMaterial({ color: enemy ? 0xff684f : 0xffe08a }));
}

export function createGrenadeModel() {
  const root = new THREE.Group();
  root.add(mesh(new THREE.SphereGeometry(0.12, 10, 8), std(0x4b5941, 0.7, 0.25)));
  root.add(mesh(new THREE.BoxGeometry(0.06, 0.11, 0.08), std(MAT.brass2, 0.5, 0.35), { y: 0.13 }));
  return root;
}

export function createMuzzleFlash() {
  const flash = new THREE.Group();
  const core = mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 }));
  const cone = mesh(new THREE.ConeGeometry(0.12, 0.38, 7), new THREE.MeshBasicMaterial({ color: MAT.muzzle, transparent: true, opacity: 0.88 }), { x: 0.22, rz: -Math.PI / 2 });
  flash.add(core, cone);
  flash.userData.life = 0.07;
  return flash;
}

export function createExplosionParticle(color = 0xffa43c, size = 0.1) {
  return mesh(new THREE.SphereGeometry(size, 7, 5), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 }));
}

export function createSlugEnvironment(scene) {
  const env = new THREE.Group();
  env.name = 'pawn-slug-environment';
  scene.add(env);

  const ground = mesh(new THREE.BoxGeometry(150, 0.55, 7), std(0x2b2925, 0.98), { x: 72, y: -0.28 });
  ground.receiveShadow = true;
  env.add(ground);

  const lane = mesh(new THREE.PlaneGeometry(150, 4.8), new THREE.MeshStandardMaterial({ color: 0x39352f, roughness: 1, metalness: 0 }), { x: 72, y: 0.012, rx: -Math.PI / 2 });
  lane.receiveShadow = true;
  env.add(lane);

  for (let x = 3; x < 145; x += 6.5) {
    const rubble = new THREE.Group();
    const count = 2 + (Math.floor(x) % 3);
    for (let i = 0; i < count; i += 1) {
      const rock = mesh(new THREE.DodecahedronGeometry(0.12 + ((i + x) % 3) * 0.05, 0), std(0x49443d, 0.95), { x: x + i * 0.23, y: 0.08, z: 1.1 + ((i * 7) % 4) * 0.27, ry: i * 0.7 });
      rubble.add(rock);
    }
    env.add(rubble);
  }

  const fortressMat = std(0x2b3038, 0.92);
  for (let x = 12; x < 145; x += 18) {
    const tower = new THREE.Group();
    tower.position.set(x, 0, -4.2);
    const shaft = mesh(new THREE.BoxGeometry(2.1, 5.2 + (x % 3), 2.1), fortressMat.clone(), { y: 2.6 });
    const crown = mesh(new THREE.BoxGeometry(2.5, 0.5, 2.5), std(0x24282f, 0.9), { y: 5.2 + (x % 3) });
    tower.add(shaft, crown);
    for (let c = -1; c <= 1; c += 1) {
      const slit = mesh(new THREE.BoxGeometry(0.16, 0.65, 0.03), new THREE.MeshBasicMaterial({ color: 0x9b3a2a }), { x: c * 0.55, y: 3.1, z: 1.07 });
      tower.add(slit);
    }
    env.add(tower);
  }

  const far = new THREE.Group();
  far.position.z = -8;
  env.add(far);
  for (let x = 0; x < 150; x += 12) {
    const hill = mesh(new THREE.ConeGeometry(5 + (x % 4), 7 + (x % 3), 6), new THREE.MeshLambertMaterial({ color: 0x1b2027 }), { x, y: 2.2, ry: Math.PI / 6 });
    hill.scale.z = 0.35;
    far.add(hill);
  }

  return { root: env, far };
}

export function animateMatthiasSlug(model, { time = 0, running = false, crouch = false, firing = false, dir = 1, hurt = false } = {}) {
  const rig = model.userData.rig;
  if (!rig) return;
  model.scale.x = Math.abs(model.scale.x || 1) * dir;
  const pace = running ? Math.sin(time * 16) : Math.sin(time * 3) * 0.15;
  rig.body.position.y = crouch ? -0.18 : Math.abs(pace) * 0.035;
  rig.headRig.rotation.z = hurt ? -0.13 : running ? pace * 0.035 : Math.sin(time * 1.7) * 0.01;
  rig.headRig.position.y = 1.27 + (crouch ? -0.16 : 0);
  rig.armRig.rotation.z = firing ? -0.08 : running ? pace * 0.09 : 0;
  rig.gunMount.position.y = 0.82 + (crouch ? -0.2 : 0);
  rig.bootL.position.x = -0.16 + pace * 0.08;
  rig.bootR.position.x = 0.2 - pace * 0.08;
  rig.shadow.scale.x = running ? 1.2 : 1.05;
}

export function animateSlugEnemy(model, type, time, state = {}) {
  const rig = model.userData.rig;
  if (!rig) return;
  const pace = Math.sin(time * (type === 'knight' ? 13 : 8));
  if (rig.main) {
    rig.main.rotation.z = state.hurt ? -0.09 : state.moving ? pace * 0.035 : 0;
    rig.main.position.y = state.moving ? Math.abs(pace) * 0.025 : 0;
  }
  if (type === 'boss' && rig.turret) rig.turret.rotation.z = Math.sin(time * 0.7) * 0.035;
}

export function disposePawnSlugObject(object) {
  if (!object) return;
  object.traverse?.((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach((material) => material?.dispose?.());
    else child.material?.dispose?.();
  });
}
