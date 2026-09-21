import * as THREE from 'three';
import { CHRONICLES_ISOMETRIC_CELL_SIZE } from './chronicles/chroniclesIsometricDungeonPlan.js';

const CANONICAL_SCENE_HALF_DEPTH = CHRONICLES_ISOMETRIC_CELL_SIZE * 3;
const CANONICAL_BACKDROP_Z = -8.35;

export function chroniclesTacticsBackdropZForScenePlan(scenePlan = null) {
  const height = Math.max(1, Number(scenePlan?.height) || 7);
  const halfDepth = ((height - 1) * CHRONICLES_ISOMETRIC_CELL_SIZE) / 2;
  const extraDepth = Math.max(0, halfDepth - CANONICAL_SCENE_HALF_DEPTH);
  return CANONICAL_BACKDROP_Z - extraDepth;
}

export const CHRONICLES_TACTICS_FORTRESS_STYLE = Object.freeze({
  motif: 'heraldic-fortress',
  bannerCount: 2,
  battlementCount: 7,
  skylineTowerCount: 7,
  primaryCloth: 0x1f3550,
  secondaryCloth: 0x542c2a,
  heraldry: 0xc9a25c,
});

export const CHRONICLES_TACTICS_PAINTED_LIGHTING = Object.freeze({
  fogColor: 0x18191c,
  fogDensity: 0.0168,
  coarseFogDensity: 0.0205,
  coolLight: 0x7890a8,
  warmLight: 0xd07a3d,
});

export const CHRONICLES_TACTICS_SKYLINE_PLAN = Object.freeze([
  Object.freeze({ x: -6.4, z: -2.3, width: 1.1, height: 4.4 }),
  Object.freeze({ x: -4.55, z: -3.2, width: 1.25, height: 5.9 }),
  Object.freeze({ x: -2.6, z: -4.0, width: 1.05, height: 5.0 }),
  Object.freeze({ x: 0, z: -5.0, width: 1.5, height: 7.2 }),
  Object.freeze({ x: 2.55, z: -4.2, width: 1.05, height: 5.2 }),
  Object.freeze({ x: 4.55, z: -3.35, width: 1.28, height: 6.1 }),
  Object.freeze({ x: 6.45, z: -2.45, width: 1.08, height: 4.6 }),
]);

function ownedMaterial(params) {
  const material = new THREE.MeshStandardMaterial(params);
  material.userData.chroniclesIsoOwned = true;
  return material;
}

function ownedBasicMaterial(params) {
  const material = new THREE.MeshBasicMaterial(params);
  material.userData.chroniclesIsoOwned = true;
  return material;
}

function addMesh(root, geometry, material, position, name, {
  castShadow = true,
  receiveShadow = true,
} = {}) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.name = name;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  root.add(mesh);
  return mesh;
}

function bannerGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.52, 0.92);
  shape.lineTo(0.52, 0.92);
  shape.lineTo(0.52, -0.66);
  shape.lineTo(0.18, -1.02);
  shape.lineTo(0, -0.78);
  shape.lineTo(-0.18, -1.02);
  shape.lineTo(-0.52, -0.66);
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

function buildBanner(root, {
  x,
  clothColor,
  index,
  brass,
  coarsePointer,
}) {
  const banner = new THREE.Group();
  banner.name = `chronicles-fortress-banner-${index}`;
  banner.position.set(x, 2.5, 0.62);

  const cloth = new THREE.Mesh(
    bannerGeometry(),
    ownedMaterial({
      color: clothColor,
      roughness: 0.9,
      metalness: 0.01,
      side: THREE.DoubleSide,
    }),
  );
  cloth.castShadow = !coarsePointer;
  cloth.receiveShadow = true;
  banner.add(cloth);

  const crossVertical = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.95, 0.028), brass);
  crossVertical.position.set(0, 0.04, 0.026);
  crossVertical.castShadow = !coarsePointer;
  banner.add(crossVertical);

  const crossHorizontal = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.075, 0.028), brass);
  crossHorizontal.position.set(0, 0.18, 0.026);
  crossHorizontal.castShadow = !coarsePointer;
  banner.add(crossHorizontal);

  const finial = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, coarsePointer ? 8 : 12, coarsePointer ? 6 : 10),
    brass,
  );
  finial.position.set(0.64, 0.96, 0.01);
  finial.castShadow = !coarsePointer;
  banner.add(finial);

  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 1.48, 8), brass);
  rail.rotation.z = Math.PI / 2;
  rail.position.set(0, 0.96, 0.01);
  rail.castShadow = !coarsePointer;
  banner.add(rail);

  root.add(banner);
  return banner;
}

function buildSkylineTower(root, tower, index, {
  stone,
  roof,
  windowMaterial,
  coarsePointer,
}) {
  const group = new THREE.Group();
  group.name = `chronicles-fortress-skyline-tower-${index}`;
  group.position.set(tower.x, 0, tower.z);

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(tower.width, tower.height, Math.max(0.72, tower.width * 0.72)),
    stone,
  );
  body.position.y = tower.height / 2;
  body.castShadow = false;
  body.receiveShadow = false;
  group.add(body);

  const crown = new THREE.Mesh(
    new THREE.ConeGeometry(tower.width * 0.72, 1.25 + tower.width * 0.18, 4),
    roof,
  );
  crown.position.y = tower.height + 0.65;
  crown.rotation.y = Math.PI / 4;
  crown.castShadow = false;
  group.add(crown);

  const spire = new THREE.Mesh(
    new THREE.CylinderGeometry(0.026, 0.05, 1.05, 6),
    roof,
  );
  spire.position.y = tower.height + 1.78;
  group.add(spire);

  if (!coarsePointer || index % 2 === 1) {
    const windowRows = tower.height > 5.5 ? [0.38, 0.62] : [0.48];
    windowRows.forEach((ratio, rowIndex) => {
      const window = new THREE.Mesh(
        new THREE.BoxGeometry(Math.max(0.09, tower.width * 0.12), 0.16, 0.025),
        windowMaterial,
      );
      window.name = `chronicles-fortress-skyline-window-${index}-${rowIndex}`;
      window.position.set(0, tower.height * ratio, tower.width * 0.37 + 0.02);
      group.add(window);
    });
  }

  root.add(group);
  return group;
}

export function buildChroniclesTacticsDistantSkyline(root, { coarsePointer = false } = {}) {
  if (!root?.add) return null;
  const existing = root.getObjectByName?.('chronicles-fortress-distant-skyline');
  if (existing) return existing;

  const skyline = new THREE.Group();
  skyline.name = 'chronicles-fortress-distant-skyline';

  const stone = ownedMaterial({
    color: 0x24272a,
    roughness: 0.98,
    metalness: 0,
  });
  const roof = ownedMaterial({
    color: 0x16191d,
    roughness: 0.94,
    metalness: 0.03,
  });
  const windowMaterial = ownedBasicMaterial({
    color: 0xd59a54,
    transparent: true,
    opacity: coarsePointer ? 0.42 : 0.58,
    depthWrite: false,
  });

  CHRONICLES_TACTICS_SKYLINE_PLAN.forEach((tower, index) => {
    buildSkylineTower(skyline, tower, index, {
      stone,
      roof,
      windowMaterial,
      coarsePointer,
    });
  });

  const bridgeMaterial = ownedMaterial({ color: 0x202326, roughness: 0.98, metalness: 0 });
  [-1, 1].forEach((side, index) => {
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.38, 0.5), bridgeMaterial);
    bridge.name = `chronicles-fortress-skyline-bridge-${index}`;
    bridge.position.set(side * 2.35, 2.5 + index * 0.35, -4.15 + index * 0.28);
    bridge.rotation.z = side * -0.035;
    skyline.add(bridge);
  });

  const hazeMaterial = ownedBasicMaterial({
    color: 0x72777b,
    transparent: true,
    opacity: coarsePointer ? 0.028 : 0.042,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const hazeLayers = coarsePointer ? 1 : 2;
  for (let index = 0; index < hazeLayers; index += 1) {
    const haze = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8), hazeMaterial);
    haze.name = `chronicles-fortress-haze-${index}`;
    haze.position.set(index ? 2.7 : -2.4, 1.35 + index * 0.5, -3.5 - index * 1.25);
    haze.scale.set(6.8 - index * 0.8, 0.72, 2.35);
    haze.renderOrder = -2;
    skyline.add(haze);
  }

  root.add(skyline);
  return skyline;
}

export function installChroniclesTacticsFortressAccents(
  shrine,
  { wall, trim, brass, coarsePointer = false } = {},
) {
  if (!shrine || !wall || !trim || !brass) return null;

  const accents = new THREE.Group();
  accents.name = 'chronicles-fortress-accents';

  addMesh(
    accents,
    new THREE.BoxGeometry(6.7, 0.18, 1.42),
    trim,
    [0, 0.09, 0.36],
    'chronicles-fortress-threshold',
    { castShadow: !coarsePointer, receiveShadow: true },
  );

  [-3.08, 3.08].forEach((x, index) => {
    addMesh(
      accents,
      new THREE.BoxGeometry(0.72, 3.85, 0.94),
      wall,
      [x, 1.82, -0.06],
      `chronicles-fortress-buttress-${index}`,
      { castShadow: !coarsePointer, receiveShadow: true },
    );
    addMesh(
      accents,
      new THREE.BoxGeometry(0.96, 0.2, 1.08),
      trim,
      [x, 3.72, -0.02],
      `chronicles-fortress-buttress-cap-${index}`,
      { castShadow: !coarsePointer, receiveShadow: true },
    );
  });

  const gableLeft = addMesh(
    accents,
    new THREE.BoxGeometry(3.15, 0.22, 0.4),
    trim,
    [-1.28, 4.05, 0],
    'chronicles-fortress-gable-left',
    { castShadow: !coarsePointer, receiveShadow: true },
  );
  gableLeft.rotation.z = 0.48;

  const gableRight = addMesh(
    accents,
    new THREE.BoxGeometry(3.15, 0.22, 0.4),
    trim,
    [1.28, 4.05, 0],
    'chronicles-fortress-gable-right',
    { castShadow: !coarsePointer, receiveShadow: true },
  );
  gableRight.rotation.z = -0.48;

  const battlementGeometry = new THREE.BoxGeometry(0.46, 0.44, 0.62);
  const battlementXs = [-2.25, -1.5, -0.75, 0, 0.75, 1.5, 2.25];
  battlementXs.forEach((x, index) => {
    addMesh(
      accents,
      battlementGeometry,
      wall,
      [x, 3.69, -0.02],
      `chronicles-fortress-battlement-${index}`,
      { castShadow: !coarsePointer, receiveShadow: true },
    );
  });

  buildBanner(accents, {
    x: -4.08,
    clothColor: CHRONICLES_TACTICS_FORTRESS_STYLE.primaryCloth,
    index: 0,
    brass,
    coarsePointer,
  });
  buildBanner(accents, {
    x: 4.08,
    clothColor: CHRONICLES_TACTICS_FORTRESS_STYLE.secondaryCloth,
    index: 1,
    brass,
    coarsePointer,
  });

  const crest = new THREE.Group();
  crest.name = 'chronicles-fortress-crest';
  crest.position.set(0, 4.55, 0.18);
  const crestRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.34, 0.05, 8, coarsePointer ? 16 : 24),
    brass,
  );
  crestRing.castShadow = !coarsePointer;
  crest.add(crestRing);
  const crestBlade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.62, 0.05), brass);
  crestBlade.rotation.z = Math.PI / 4;
  crest.add(crestBlade);
  const crestBladeCross = crestBlade.clone();
  crestBladeCross.rotation.z = -Math.PI / 4;
  crest.add(crestBladeCross);
  accents.add(crest);

  shrine.add(accents);
  return accents;
}

export function applyChroniclesTacticsPaintedAtmosphere(scene, { coarsePointer = false } = {}) {
  if (!scene?.add) return null;
  const existing = scene.getObjectByName?.('chronicles-fortress-painted-lighting');
  if (existing) return existing;

  if (scene.fog?.isFogExp2) {
    scene.fog.color.setHex(CHRONICLES_TACTICS_PAINTED_LIGHTING.fogColor);
    scene.fog.density = coarsePointer
      ? CHRONICLES_TACTICS_PAINTED_LIGHTING.coarseFogDensity
      : CHRONICLES_TACTICS_PAINTED_LIGHTING.fogDensity;
  }

  const lighting = new THREE.Group();
  lighting.name = 'chronicles-fortress-painted-lighting';

  const cool = new THREE.DirectionalLight(
    CHRONICLES_TACTICS_PAINTED_LIGHTING.coolLight,
    coarsePointer ? 0.2 : 0.3,
  );
  cool.name = 'chronicles-fortress-cool-wash';
  cool.position.set(-4.5, 7.5, -10);
  lighting.add(cool);

  const warm = new THREE.PointLight(
    CHRONICLES_TACTICS_PAINTED_LIGHTING.warmLight,
    coarsePointer ? 0.34 : 0.5,
    18,
    2,
  );
  warm.name = 'chronicles-fortress-warm-wash';
  warm.position.set(0, 3.2, -7.4);
  lighting.add(warm);

  scene.add(lighting);
  return lighting;
}

export function installChroniclesTacticsFortressBackdrop(
  scene,
  { coarsePointer = false, scenePlan = null } = {},
) {
  if (!scene?.add) return null;
  const existing = scene.getObjectByName?.('chronicles-fortress-backdrop');
  if (existing) return existing;

  applyChroniclesTacticsPaintedAtmosphere(scene, { coarsePointer });

  const backdrop = new THREE.Group();
  backdrop.name = 'chronicles-fortress-backdrop';
  backdrop.position.set(0, 0, chroniclesTacticsBackdropZForScenePlan(scenePlan));

  const wall = ownedMaterial({ color: 0x413b35, roughness: 0.96, metalness: 0.01 });
  const trim = ownedMaterial({ color: 0x201b17, roughness: 0.96, metalness: 0.02 });
  const brass = ownedMaterial({
    color: CHRONICLES_TACTICS_FORTRESS_STYLE.heraldry,
    roughness: 0.44,
    metalness: 0.62,
    emissive: 0x160b03,
    emissiveIntensity: 0.18,
  });

  buildChroniclesTacticsDistantSkyline(backdrop, { coarsePointer });
  installChroniclesTacticsFortressAccents(backdrop, {
    wall,
    trim,
    brass,
    coarsePointer,
  });
  scene.add(backdrop);
  return backdrop;
}
