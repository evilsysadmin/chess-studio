import * as THREE from 'three';
import { CHRONICLES_ISOMETRIC_CELL_SIZE } from './chronicles/chroniclesIsometricDungeonPlan.js';
import { chroniclesIsometricCellToWorld } from './chronicles/chroniclesIsometricScenePlan.js';

const ROOT_NAME = 'chronicles-tactics-theme-dressing';
const CELL = CHRONICLES_ISOMETRIC_CELL_SIZE;

export const CHRONICLES_TACTICS_THEME_DRESSING_VERSION = 1;

const SIDE = Object.freeze({
  north: Object.freeze({ nx: 0, nz: -1, tx: 1, tz: 0, yaw: 0 }),
  east: Object.freeze({ nx: 1, nz: 0, tx: 0, tz: 1, yaw: Math.PI / 2 }),
  south: Object.freeze({ nx: 0, nz: 1, tx: 1, tz: 0, yaw: 0 }),
  west: Object.freeze({ nx: -1, nz: 0, tx: 0, tz: 1, yaw: Math.PI / 2 }),
});

function ownedMaterial(params) {
  const material = new THREE.MeshStandardMaterial(params);
  material.userData.chroniclesIsoOwned = true;
  return material;
}

function faceAnchor(scenePlan, face) {
  const side = SIDE[face?.side];
  if (!side) return null;
  const world = chroniclesIsometricCellToWorld(scenePlan, face.x, face.y, CELL);
  return Object.freeze({
    x: world.x + side.nx * (CELL * 0.5 + 0.075),
    z: world.z + side.nz * (CELL * 0.5 + 0.075),
    yaw: side.yaw,
    ...side,
  });
}

function uniqueFaceAnchors(scenePlan) {
  const seen = new Set();
  return (scenePlan?.wallFaces || [])
    .map((face) => ({ face, anchor: faceAnchor(scenePlan, face) }))
    .filter(({ face, anchor }) => {
      if (!anchor) return false;
      const key = `${face.x}:${face.y}:${face.side}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (
      a.face.y - b.face.y
      || a.face.x - b.face.x
      || String(a.face.side).localeCompare(String(b.face.side))
    ))
    .map(({ anchor }) => anchor);
}

function spread(anchors, count, offset = 0) {
  if (!anchors.length || count <= 0) return [];
  const capped = Math.min(count, anchors.length);
  if (capped === 1) return [anchors[Math.min(anchors.length - 1, offset)]];
  const picks = [];
  const used = new Set();
  for (let index = 0; index < capped; index += 1) {
    const raw = Math.round((index * (anchors.length - 1)) / (capped - 1));
    const picked = (raw + offset) % anchors.length;
    if (!used.has(picked)) {
      used.add(picked);
      picks.push(anchors[picked]);
    }
  }
  return picks;
}

function freezePlan(id, values = {}) {
  const freezeAnchors = (entries = []) => Object.freeze(entries.map((entry) => Object.freeze({ ...entry })));
  return Object.freeze({
    version: CHRONICLES_TACTICS_THEME_DRESSING_VERSION,
    id,
    cages: freezeAnchors(values.cages),
    braziers: freezeAnchors(values.braziers),
    banners: freezeAnchors(values.banners),
    reliefs: freezeAnchors(values.reliefs),
    boneBundles: freezeAnchors(values.boneBundles),
  });
}

export function chroniclesTacticsThemeDressingPlan(scenePlan = {}) {
  const dressing = scenePlan?.sceneStyle?.dressing || 'none';
  const anchors = uniqueFaceAnchors(scenePlan);

  if (dressing === 'menagerie-ash-v3') {
    return freezePlan(dressing, {
      cages: spread(anchors, 3, 1),
      braziers: spread(anchors, 4, 0),
      boneBundles: spread(anchors, 4, 2),
    });
  }

  if (dressing === 'gallery-forked-v3') {
    return freezePlan(dressing, {
      banners: spread(anchors, 3, 1),
      braziers: spread(anchors, 3, 0),
      reliefs: spread(anchors, 3, 2),
    });
  }

  return freezePlan('none');
}

function setBox(mesh, index, dummy, {
  x, y, z, sx, sy, sz, yaw = 0,
}) {
  dummy.position.set(x, y, z);
  dummy.rotation.set(0, yaw, 0);
  dummy.scale.set(sx, sy, sz);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
}

function buildCages(root, anchors, material, { coarsePointer }) {
  if (!anchors.length) return null;
  const segmentsPerCage = coarsePointer ? 5 : 7;
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.InstancedMesh(geometry, material, anchors.length * segmentsPerCage);
  mesh.name = 'chronicles-theme-menagerie-cage-bars';
  mesh.castShadow = !coarsePointer;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;

  const dummy = new THREE.Object3D();
  let index = 0;
  anchors.forEach((anchor) => {
    const front = 0.12;
    const verticals = coarsePointer ? [-0.44, 0, 0.44] : [-0.52, -0.26, 0, 0.26, 0.52];
    verticals.forEach((offset) => {
      setBox(mesh, index++, dummy, {
        x: anchor.x + anchor.tx * offset + anchor.nx * front,
        y: 1.03,
        z: anchor.z + anchor.tz * offset + anchor.nz * front,
        sx: 0.055,
        sy: 1.48,
        sz: 0.055,
        yaw: anchor.yaw,
      });
    });
    [0.34, 1.7].forEach((y) => {
      setBox(mesh, index++, dummy, {
        x: anchor.x + anchor.nx * front,
        y,
        z: anchor.z + anchor.nz * front,
        sx: 1.18,
        sy: 0.065,
        sz: 0.075,
        yaw: anchor.yaw,
      });
    });
  });

  mesh.instanceMatrix.needsUpdate = true;
  root.add(mesh);
  return mesh;
}

function buildBraziers(root, anchors, palette, { coarsePointer, menagerie }) {
  const metal = ownedMaterial({
    color: palette?.metal ?? 0x7d5a35,
    roughness: 0.38,
    metalness: 0.72,
  });
  const ember = ownedMaterial({
    color: menagerie ? 0xf0a05c : 0xbfd0b9,
    roughness: 0.28,
    metalness: 0.04,
    emissive: menagerie ? 0xb9451d : 0x49796f,
    emissiveIntensity: menagerie ? 2.4 : 1.45,
  });

  anchors.forEach((anchor, index) => {
    const group = new THREE.Group();
    group.name = `chronicles-theme-brazier-${index}`;
    group.position.set(
      anchor.x + anchor.nx * 0.16,
      0,
      anchor.z + anchor.nz * 0.16,
    );

    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.56, 0.08), metal);
    bracket.position.set(0, 1.18, 0);
    bracket.rotation.y = anchor.yaw;
    bracket.castShadow = !coarsePointer;

    const bowl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.13, 0.16, coarsePointer ? 10 : 18),
      metal,
    );
    bowl.position.y = 1.48;
    bowl.castShadow = !coarsePointer;

    const flame = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.13, coarsePointer ? 0 : 1),
      ember,
    );
    flame.position.y = 1.67;
    flame.scale.set(0.8, 1.45, 0.8);

    group.add(bracket, bowl, flame);
    if (!coarsePointer || index % 2 === 0) {
      const light = new THREE.PointLight(
        menagerie ? 0xff7a32 : 0x8fb9aa,
        menagerie ? 1.3 : 0.72,
        menagerie ? 5.4 : 4.2,
        2,
      );
      light.position.y = 1.64;
      group.add(light);
    }
    root.add(group);
  });
}

function buildBanners(root, anchors, palette, { coarsePointer }) {
  const cloth = ownedMaterial({
    color: 0x24352f,
    roughness: 0.88,
    metalness: 0.01,
    side: THREE.DoubleSide,
  });
  const trim = ownedMaterial({
    color: palette?.metal ?? 0x8b7445,
    roughness: 0.46,
    metalness: 0.54,
  });

  anchors.forEach((anchor, index) => {
    const group = new THREE.Group();
    group.name = `chronicles-theme-gallery-banner-${index}`;
    group.position.set(
      anchor.x + anchor.nx * 0.1,
      0,
      anchor.z + anchor.nz * 0.1,
    );
    group.rotation.y = anchor.yaw;

    const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 1.22), cloth);
    banner.position.y = 1.42;
    banner.castShadow = !coarsePointer;

    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.08, 10), trim);
    rod.position.y = 2.08;
    rod.rotation.z = Math.PI / 2;
    rod.castShadow = !coarsePointer;

    const forkStem = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.48, 0.04), trim);
    forkStem.position.set(0, 1.45, 0.018);
    const forkLeft = forkStem.clone();
    forkLeft.scale.y = 0.58;
    forkLeft.position.set(-0.13, 1.63, 0.018);
    forkLeft.rotation.z = 0.42;
    const forkRight = forkStem.clone();
    forkRight.scale.y = 0.58;
    forkRight.position.set(0.13, 1.63, 0.018);
    forkRight.rotation.z = -0.42;

    group.add(banner, rod, forkStem, forkLeft, forkRight);
    root.add(group);
  });
}

function buildReliefs(root, anchors, palette, { coarsePointer }) {
  const material = ownedMaterial({
    color: palette?.metal ?? 0x8b7445,
    roughness: 0.4,
    metalness: 0.62,
  });
  anchors.forEach((anchor, index) => {
    const group = new THREE.Group();
    group.name = `chronicles-theme-gallery-relief-${index}`;
    group.position.set(
      anchor.x + anchor.nx * 0.115,
      1.03,
      anchor.z + anchor.nz * 0.115,
    );
    group.rotation.y = anchor.yaw;

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.25, 0.035, 7, coarsePointer ? 14 : 22),
      material,
    );
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.56, 0.05), material);
    const tineL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.28, 0.05), material);
    tineL.position.set(-0.11, 0.18, 0);
    tineL.rotation.z = 0.4;
    const tineR = tineL.clone();
    tineR.position.x = 0.11;
    tineR.rotation.z = -0.4;
    group.add(ring, stem, tineL, tineR);
    root.add(group);
  });
}

function buildBoneBundles(root, anchors, { coarsePointer }) {
  if (!anchors.length) return null;
  const bone = ownedMaterial({ color: 0xa89b84, roughness: 0.86, metalness: 0.01 });
  const piecesPerBundle = coarsePointer ? 2 : 3;
  const geometry = new THREE.CylinderGeometry(0.035, 0.05, 0.72, 7);
  const mesh = new THREE.InstancedMesh(geometry, bone, anchors.length * piecesPerBundle);
  mesh.name = 'chronicles-theme-menagerie-bone-bundles';
  mesh.castShadow = !coarsePointer;
  mesh.receiveShadow = true;

  const dummy = new THREE.Object3D();
  let index = 0;
  anchors.forEach((anchor, bundleIndex) => {
    for (let piece = 0; piece < piecesPerBundle; piece += 1) {
      const tangent = (piece - (piecesPerBundle - 1) / 2) * 0.16;
      dummy.position.set(
        anchor.x + anchor.tx * tangent + anchor.nx * 0.18,
        0.26 + piece * 0.025,
        anchor.z + anchor.tz * tangent + anchor.nz * 0.18,
      );
      dummy.rotation.set(
        Math.PI / 2 + (piece - 1) * 0.12,
        anchor.yaw + bundleIndex * 0.19,
        0.45 - piece * 0.32,
      );
      dummy.scale.set(1, 0.75 + piece * 0.08, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(index++, dummy.matrix);
    }
  });
  mesh.instanceMatrix.needsUpdate = true;
  root.add(mesh);
  return mesh;
}

export function installChroniclesTacticsThemeDressing(scene, {
  coarsePointer = false,
  scenePlan = {},
} = {}) {
  if (!scene?.add) return null;
  const existing = scene.getObjectByName(ROOT_NAME);
  if (existing) return existing;

  const plan = chroniclesTacticsThemeDressingPlan(scenePlan);
  const root = new THREE.Group();
  root.name = ROOT_NAME;
  root.userData.chroniclesThemeDressingVersion = CHRONICLES_TACTICS_THEME_DRESSING_VERSION;
  root.userData.chroniclesThemeDressing = plan.id;
  root.userData.chroniclesThemePropCount = (
    plan.cages.length
    + plan.braziers.length
    + plan.banners.length
    + plan.reliefs.length
    + plan.boneBundles.length
  );

  if (plan.id === 'none') {
    scene.add(root);
    return root;
  }

  const palette = scenePlan?.sceneStyle?.palette || {};
  const metal = ownedMaterial({
    color: palette.metal ?? 0x765033,
    roughness: 0.48,
    metalness: 0.64,
  });

  if (plan.id === 'menagerie-ash-v3') {
    buildCages(root, plan.cages, metal, { coarsePointer });
    buildBraziers(root, plan.braziers, palette, { coarsePointer, menagerie: true });
    buildBoneBundles(root, plan.boneBundles, { coarsePointer });
  } else if (plan.id === 'gallery-forked-v3') {
    buildBanners(root, plan.banners, palette, { coarsePointer });
    buildBraziers(root, plan.braziers, palette, { coarsePointer, menagerie: false });
    buildReliefs(root, plan.reliefs, palette, { coarsePointer });
  }

  scene.add(root);
  return root;
}
