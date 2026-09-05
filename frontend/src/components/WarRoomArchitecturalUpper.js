import * as THREE from 'three';

const UPPER_ARCHITECTURE_VERSION = 'hammerbeam-v8-canonical';
const UPPER_ARCHITECTURE_MESH_BUDGET = 7;
const RETIRED_MESHES_OMITTED = 12;

function physical(color, options = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: options.metalness ?? 0,
    roughness: options.roughness ?? 0.78,
    clearcoat: options.clearcoat ?? 0.06,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.52,
    specularIntensity: options.specularIntensity ?? 0.22,
  });
}

function addBeam(group, size, material, position, rotation = [0, 0, 0], name = '') {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  if (name) mesh.name = name;
  group.add(mesh);
  return mesh;
}

function addCanonicalHammerbeamFrame(group, offset, wallZ, towardBoard, oak) {
  const z = wallZ + towardBoard * offset;
  addBeam(
    group,
    [14.15, 0.18, 0.22],
    oak,
    [0, 5.36, z],
    [0, 0, 0],
    'war-room-hammerbeam-transverse',
  );
}

export function installWarRoomArchitecturalUpper(group, {
  wallZ,
  towardBoard,
  coarsePointer = false,
} = {}) {
  if (!group || coarsePointer || !Number.isFinite(wallZ) || !Number.isFinite(towardBoard)) return 0;
  if (group.userData.warRoomUpperArchitecture === UPPER_ARCHITECTURE_VERSION) return 0;

  const oak = physical(0x26160e, {
    roughness: 0.72,
    clearcoat: 0.11,
    clearcoatRoughness: 0.46,
    specularIntensity: 0.28,
  });

  const layer = new THREE.Group();
  layer.name = 'war-room-upper-architecture';
  layer.userData.warRoomUpperArchitecture = UPPER_ARCHITECTURE_VERSION;
  layer.userData.warRoomUpperArchitectureMeshBudget = UPPER_ARCHITECTURE_MESH_BUDGET;
  layer.userData.warRoomUpperArchitectureZone = 'far-third-camera-clear';
  layer.userData.warRoomRetiredUpperMeshesOmitted = RETIRED_MESHES_OMITTED;
  layer.userData.warRoomMonogramFree = true;

  const frameOffsets = [0.72, 1.9, 3.08];
  for (const offset of frameOffsets) {
    addCanonicalHammerbeamFrame(layer, offset, wallZ, towardBoard, oak);
  }

  const longitudinalCenterZ = wallZ + towardBoard * 1.9;
  for (const x of [-5.25, -1.75, 1.75, 5.25]) {
    addBeam(
      layer,
      [0.16, 0.16, 3.05],
      oak,
      [x, 5.5, longitudinalCenterZ],
      [0, 0, 0],
      'war-room-hammerbeam-longitudinal',
    );
  }

  group.add(layer);
  group.userData.warRoomUpperArchitecture = UPPER_ARCHITECTURE_VERSION;
  group.userData.warRoomUpperArchitectureMeshBudget = UPPER_ARCHITECTURE_MESH_BUDGET;
  group.userData.warRoomUpperArchitectureMaxOffsetFromWall = Math.max(...frameOffsets);
  group.userData.warRoomRetiredUpperMeshesOmitted = RETIRED_MESHES_OMITTED;
  group.userData.warRoomMonogramFree = true;
  return UPPER_ARCHITECTURE_MESH_BUDGET;
}
