import * as THREE from 'three';
import { CHRONICLES_ISOMETRIC_CELL_SIZE } from './chronicles/chroniclesIsometricDungeonPlan.js';
import { chroniclesIsometricCellToWorld } from './chronicles/chroniclesIsometricScenePlan.js';
import { createChroniclesStoneSurfaceTexture } from './chroniclesStoneSurfaceTexture.js';

const ROOT_NAME = 'chronicles-tactics-room-floor-detail';
const CELL = CHRONICLES_ISOMETRIC_CELL_SIZE;

export const CHRONICLES_TACTICS_ROOM_FLOOR_VERSION = 1;

const SIDE = Object.freeze({
  north: Object.freeze({ nx: 0, nz: -1, yaw: 0 }),
  east: Object.freeze({ nx: 1, nz: 0, yaw: Math.PI / 2 }),
  south: Object.freeze({ nx: 0, nz: 1, yaw: 0 }),
  west: Object.freeze({ nx: -1, nz: 0, yaw: Math.PI / 2 }),
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
    x: world.x + side.nx * (CELL * 0.5 + 0.11),
    z: world.z + side.nz * (CELL * 0.5 + 0.11),
    ...side,
  });
}

function uniqueAnchors(scenePlan) {
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
  if (capped === 1) return [anchors[Math.min(offset, anchors.length - 1)]];
  const result = [];
  const used = new Set();
  for (let index = 0; index < capped; index += 1) {
    const raw = Math.round((index * (anchors.length - 1)) / (capped - 1));
    const picked = (raw + offset) % anchors.length;
    if (!used.has(picked)) {
      used.add(picked);
      result.push(anchors[picked]);
    }
  }
  return result;
}

export function chroniclesTacticsRoomFloorPlan(scenePlan = {}) {
  const edges = Object.freeze(uniqueAnchors(scenePlan));
  const dressing = scenePlan?.sceneStyle?.dressing || 'none';

  if (dressing === 'gallery-forked-v3') {
    return Object.freeze({
      version: CHRONICLES_TACTICS_ROOM_FLOOR_VERSION,
      id: dressing,
      edges,
      featureKind: 'gallery-fork-inlay',
      features: Object.freeze(spread(edges, 4, 1)),
    });
  }
  if (dressing === 'menagerie-ash-v3') {
    return Object.freeze({
      version: CHRONICLES_TACTICS_ROOM_FLOOR_VERSION,
      id: dressing,
      edges,
      featureKind: 'menagerie-ash-grate',
      features: Object.freeze(spread(edges, 4, 2)),
    });
  }
  return Object.freeze({
    version: CHRONICLES_TACTICS_ROOM_FLOOR_VERSION,
    id: dressing,
    edges,
    featureKind: null,
    features: Object.freeze([]),
  });
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

function buildCurbs(root, edges, material, { coarsePointer }) {
  if (!edges.length) return null;
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.InstancedMesh(geometry, material, edges.length);
  mesh.name = 'chronicles-room-floor-curb-instances';
  mesh.castShadow = !coarsePointer;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;

  const dummy = new THREE.Object3D();
  edges.forEach((edge, index) => {
    setBox(mesh, index, dummy, {
      x: edge.x + edge.nx * 0.06,
      y: 0.055,
      z: edge.z + edge.nz * 0.06,
      sx: 1.08,
      sy: 0.065,
      sz: 0.13,
      yaw: edge.yaw,
    });
  });
  mesh.instanceMatrix.needsUpdate = true;
  root.add(mesh);
  return mesh;
}

function addGalleryFork(root, anchor, index, material, { coarsePointer }) {
  const group = new THREE.Group();
  group.name = `chronicles-room-gallery-floor-fork-${index}`;
  group.position.set(
    anchor.x + anchor.nx * 0.29,
    0.04,
    anchor.z + anchor.nz * 0.29,
  );
  group.rotation.y = anchor.yaw;

  const stem = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.025, 0.62), material);
  stem.position.z = 0.03;
  stem.castShadow = !coarsePointer;

  const left = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.025, 0.34), material);
  left.position.set(-0.105, 0.004, -0.19);
  left.rotation.y = 0.48;
  left.castShadow = !coarsePointer;

  const right = left.clone();
  right.position.x = 0.105;
  right.rotation.y = -0.48;

  group.add(stem, left, right);
  root.add(group);
}

function addMenagerieGrate(root, anchor, index, iron, ember, { coarsePointer }) {
  const group = new THREE.Group();
  group.name = `chronicles-room-menagerie-floor-grate-${index}`;
  group.position.set(
    anchor.x + anchor.nx * 0.31,
    0.035,
    anchor.z + anchor.nz * 0.31,
  );
  group.rotation.y = anchor.yaw;

  const underglow = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.012, 0.42), ember);
  underglow.position.y = -0.006;
  underglow.castShadow = false;
  group.add(underglow);

  const frameA = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.03, 0.055), iron);
  frameA.position.z = -0.24;
  const frameB = frameA.clone();
  frameB.position.z = 0.24;
  group.add(frameA, frameB);

  [-0.34, 0.34].forEach((x) => {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.03, 0.54), iron);
    side.position.x = x;
    group.add(side);
  });

  const barCount = coarsePointer ? 3 : 5;
  for (let bar = 0; bar < barCount; bar += 1) {
    const x = barCount === 1 ? 0 : -0.25 + (bar * 0.5) / (barCount - 1);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.46), iron);
    rail.position.x = x;
    rail.castShadow = !coarsePointer;
    group.add(rail);
  }

  root.add(group);
}

export function installChroniclesTacticsRoomFloorArt(scene, {
  coarsePointer = false,
  scenePlan = {},
} = {}) {
  if (!scene?.add) return null;
  const existing = scene.getObjectByName?.(ROOT_NAME);
  if (existing) return existing;

  const plan = chroniclesTacticsRoomFloorPlan(scenePlan);
  const root = new THREE.Group();
  root.name = ROOT_NAME;
  root.userData.chroniclesRoomFloorVersion = CHRONICLES_TACTICS_ROOM_FLOOR_VERSION;
  root.userData.chroniclesRoomFloorStyle = plan.id;
  root.userData.chroniclesRoomFloorEdgeCount = plan.edges.length;
  root.userData.chroniclesRoomFloorFeatureCount = plan.features.length;

  const surfaceTexture = createChroniclesStoneSurfaceTexture({
    coarsePointer,
    seed: plan.id === 'menagerie-ash-v3' ? 89 : plan.id === 'gallery-forked-v3' ? 73 : 59,
    wet: false,
  });
  root.userData.chroniclesArtCancel = () => surfaceTexture.dispose();

  const curb = ownedMaterial({
    color: scenePlan?.sceneStyle?.palette?.wallTrim ?? 0x24211e,
    map: surfaceTexture,
    roughness: 0.92,
    metalness: 0.02,
  });
  buildCurbs(root, plan.edges, curb, { coarsePointer });

  if (plan.featureKind === 'gallery-fork-inlay') {
    const metal = ownedMaterial({
      color: scenePlan?.sceneStyle?.palette?.metal ?? 0x8b7445,
      roughness: 0.42,
      metalness: 0.66,
      emissive: 0x121a17,
      emissiveIntensity: 0.08,
    });
    plan.features.forEach((anchor, index) => {
      addGalleryFork(root, anchor, index, metal, { coarsePointer });
    });
  } else if (plan.featureKind === 'menagerie-ash-grate') {
    const iron = ownedMaterial({
      color: 0x2b2623,
      roughness: 0.56,
      metalness: 0.58,
    });
    const ember = ownedMaterial({
      color: 0x4f2517,
      roughness: 0.7,
      metalness: 0.04,
      emissive: 0x8f2d16,
      emissiveIntensity: coarsePointer ? 0.42 : 0.62,
    });
    plan.features.forEach((anchor, index) => {
      addMenagerieGrate(root, anchor, index, iron, ember, { coarsePointer });
    });
  }

  scene.add(root);
  return root;
}
