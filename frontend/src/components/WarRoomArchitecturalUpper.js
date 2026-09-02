import * as THREE from 'three';

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

function addHammerbeamFrame(group, offset, wallZ, towardBoard, materials) {
  const z = wallZ + towardBoard * offset;

  addBeam(
    group,
    [14.15, 0.18, 0.22],
    materials.oak,
    [0, 5.36, z],
    [0, 0, 0],
    'war-room-hammerbeam-transverse',
  );

  for (const side of [-1, 1]) {
    // The old diagonal braces read as a repeated letter M from the tactical
    // camera. Keep the same structural density, but use short horizontal
    // hammerbeam ties instead: architectural, quiet and deliberately non-logo.
    addBeam(
      group,
      [1.62, 0.16, 0.18],
      materials.oakWarm,
      [side * 6.36, 5.03, z + towardBoard * 0.035],
      [0, 0, 0],
      'war-room-hammerbeam-side-tie',
    );

    addBeam(
      group,
      [0.42, 0.42, 0.3],
      materials.ironwood,
      [side * 7.28, 4.82, z],
      [0, 0, side * 0.08],
      'war-room-hammerbeam-corbel',
    );
  }
}

export function installWarRoomArchitecturalUpper(group, {
  wallZ,
  towardBoard,
  coarsePointer = false,
} = {}) {
  if (!group || coarsePointer || !Number.isFinite(wallZ) || !Number.isFinite(towardBoard)) return 0;
  if (group.userData.warRoomUpperArchitecture === 'hammerbeam-v7') return 0;

  const materials = {
    oak: physical(0x26160e, {
      roughness: 0.72,
      clearcoat: 0.11,
      clearcoatRoughness: 0.46,
      specularIntensity: 0.28,
    }),
    oakWarm: physical(0x3a2115, {
      roughness: 0.68,
      clearcoat: 0.13,
      clearcoatRoughness: 0.42,
      specularIntensity: 0.3,
    }),
    ironwood: physical(0x191716, {
      metalness: 0.18,
      roughness: 0.66,
      clearcoat: 0.08,
      specularIntensity: 0.34,
    }),
  };

  const layer = new THREE.Group();
  layer.name = 'war-room-upper-architecture';
  layer.userData.warRoomUpperArchitecture = 'hammerbeam-v7';
  layer.userData.warRoomUpperArchitectureMeshBudget = 19;
  layer.userData.warRoomUpperArchitectureZone = 'far-third-camera-clear';
  layer.userData.warRoomMonogramFree = true;

  const frameOffsets = [0.72, 1.9, 3.08];
  for (const offset of frameOffsets) {
    addHammerbeamFrame(layer, offset, wallZ, towardBoard, materials);
  }

  const longitudinalCenterZ = wallZ + towardBoard * 1.9;
  for (const x of [-5.25, -1.75, 1.75, 5.25]) {
    addBeam(
      layer,
      [0.16, 0.16, 3.05],
      materials.oak,
      [x, 5.5, longitudinalCenterZ],
      [0, 0, 0],
      'war-room-hammerbeam-longitudinal',
    );
  }

  group.add(layer);
  group.userData.warRoomUpperArchitecture = 'hammerbeam-v7';
  group.userData.warRoomUpperArchitectureMeshBudget = 19;
  group.userData.warRoomUpperArchitectureMaxOffsetFromWall = Math.max(...frameOffsets);
  group.userData.warRoomMonogramFree = true;
  return 19;
}
