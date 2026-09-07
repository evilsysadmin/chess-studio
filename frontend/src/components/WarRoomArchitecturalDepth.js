import * as THREE from 'three';

const ARCHITECTURAL_DEPTH_VERSION = 'v7-canonical-gallery';
const ARCHITECTURAL_DEPTH_MESH_BUDGET = 8;
const RETIRED_MESHES_OMITTED = 16;

function physical(color, options = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: options.metalness ?? 0,
    roughness: options.roughness ?? 0.76,
    clearcoat: options.clearcoat ?? 0.06,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.5,
    specularIntensity: options.specularIntensity ?? 0.24,
    sheen: options.sheen ?? 0,
    sheenRoughness: options.sheenRoughness ?? 0.72,
    sheenColor: new THREE.Color(options.sheenColor ?? color),
  });
}

function addMesh(group, geometry, material, position, rotation = [0, 0, 0], name = '') {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (name) mesh.name = name;
  group.add(mesh);
  return mesh;
}

function addBox(group, size, material, position, rotation = [0, 0, 0], name = '') {
  return addMesh(group, new THREE.BoxGeometry(...size), material, position, rotation, name);
}

function addCommandCarpet(group, materials) {
  const carpet = new THREE.Group();
  carpet.name = 'war-room-command-carpet';
  carpet.userData.warRoomArchitecturalRole = 'command-table-grounding';
  carpet.userData.warRoomCarpetFinish = 'oxblood-wool-brass-key-v1';

  const bed = addBox(
    carpet,
    [13.55, 0.025, 13.0],
    materials.carpet,
    [0, -0.244, 0],
    [0, 0, 0],
    'war-room-command-carpet-bed',
  );
  bed.castShadow = false;

  const inner = addBox(
    carpet,
    [12.95, 0.01, 12.4],
    materials.carpetInner,
    [0, -0.226, 0],
    [0, 0, 0],
    'war-room-command-carpet-inner-field',
  );
  inner.castShadow = false;

  for (const [x, z, sx, sz] of [
    [0, 6.18, 12.82, 0.045],
    [0, -6.18, 12.82, 0.045],
    [6.39, 0, 0.045, 12.4],
    [-6.39, 0, 0.045, 12.4],
  ]) {
    const trim = addBox(
      carpet,
      [sx, 0.012, sz],
      materials.brass,
      [x, -0.215, z],
      [0, 0, 0],
      'war-room-command-carpet-brass-key',
    );
    trim.castShadow = false;
  }

  group.add(carpet);
}

function addCanonicalWallSkirting(group, wallZ, towardBoard, darkStone) {
  const depth = 12.75;
  const centerZ = wallZ + towardBoard * 6.45;
  for (const side of [-1, 1]) {
    addBox(
      group,
      [0.22, 0.58, depth],
      darkStone,
      [side * 7.69, 0.17, centerZ],
      [0, 0, 0],
      'war-room-continuous-stone-skirting',
    );
  }
}

export function installWarRoomArchitecturalDepth(group, { wallZ, towardBoard, coarsePointer = false } = {}) {
  if (!group || coarsePointer || !Number.isFinite(wallZ) || !Number.isFinite(towardBoard)) return 0;
  if (group.userData.warRoomArchitecturalDepth === ARCHITECTURAL_DEPTH_VERSION) return 0;

  const materials = {
    darkStone: physical(0x3b3732, { roughness: 0.88, clearcoat: 0.02, specularIntensity: 0.14 }),
    brass: physical(0x8f682c, { metalness: 0.74, roughness: 0.36, clearcoat: 0.16, specularIntensity: 0.62 }),
    carpet: physical(0x321419, { roughness: 0.94, clearcoat: 0.005, sheen: 0.32, sheenColor: 0x6f353d }),
    carpetInner: physical(0x21181a, { roughness: 0.96, clearcoat: 0, sheen: 0.2, sheenColor: 0x4b3035 }),
  };

  const layer = new THREE.Group();
  layer.name = 'war-room-architectural-depth';
  layer.userData.warRoomArchitecturalDepth = ARCHITECTURAL_DEPTH_VERSION;
  layer.userData.warRoomArchitecturalDepthMeshBudget = ARCHITECTURAL_DEPTH_MESH_BUDGET;
  layer.userData.warRoomRetiredArchitectureOmitted = true;
  layer.userData.warRoomRetiredArchitectureMeshCount = RETIRED_MESHES_OMITTED;
  layer.userData.warRoomMonogramFree = true;

  addCommandCarpet(layer, materials);
  addCanonicalWallSkirting(layer, wallZ, towardBoard, materials.darkStone);

  group.add(layer);
  group.userData.warRoomArchitecturalDepth = ARCHITECTURAL_DEPTH_VERSION;
  group.userData.warRoomArchitecturalDepthMeshBudget = ARCHITECTURAL_DEPTH_MESH_BUDGET;
  group.userData.warRoomRetiredArchitectureOmitted = true;
  group.userData.warRoomRetiredArchitectureMeshCount = RETIRED_MESHES_OMITTED;
  group.userData.warRoomMonogramFree = true;
  return ARCHITECTURAL_DEPTH_MESH_BUDGET;
}
