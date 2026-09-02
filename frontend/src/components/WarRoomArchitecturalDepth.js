import * as THREE from 'three';

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

function addArmorAlcove(group, side, wallZ, towardBoard, materials) {
  const armorZ = wallZ + towardBoard * 4.48;
  const innerWallX = side * 7.735;
  const alcove = new THREE.Group();
  alcove.name = side < 0 ? 'war-room-armor-alcove-left' : 'war-room-armor-alcove-right';
  alcove.userData.warRoomArchitecturalRole = 'castle-armor-alcove';
  alcove.userData.warRoomArmorBackdrop = true;
  alcove.userData.warRoomMonogramFree = true;

  const back = addBox(
    alcove,
    [0.035, 3.25, 1.78],
    materials.recess,
    [innerWallX, 1.58, armorZ],
    [0, 0, 0],
    'war-room-armor-alcove-recess',
  );
  back.castShadow = false;

  for (const zOffset of [-0.91, 0.91]) {
    addBox(
      alcove,
      [0.105, 2.7, 0.105],
      materials.stoneTrim,
      [side * 7.69, 1.42, armorZ + zOffset],
      [0, 0, 0],
      'war-room-armor-alcove-jamb',
    );
  }

  // The previous pointed Gothic pair was attractive in isolation but, from the
  // tactical camera, the two diagonals plus jambs read as a giant letter M on
  // each side wall. Use a restrained horizontal stone lintel and a small
  // keystone instead: still castle architecture, no accidental Matthias logo.
  const lintel = addBox(
    alcove,
    [0.115, 0.18, 2.02],
    materials.stoneTrim,
    [side * 7.69, 3.06, armorZ],
    [0, 0, 0],
    'war-room-armor-alcove-lintel',
  );
  lintel.castShadow = false;
  const keystone = addBox(
    alcove,
    [0.125, 0.34, 0.24],
    materials.darkStone,
    [side * 7.675, 3.18, armorZ],
    [0, 0, 0],
    'war-room-armor-alcove-keystone',
  );
  keystone.castShadow = false;

  const plinth = addBox(
    alcove,
    [0.42, 0.12, 1.7],
    materials.darkStone,
    [side * 7.47, 0.02, armorZ],
    [0, 0, 0],
    'war-room-armor-alcove-plinth',
  );
  plinth.receiveShadow = true;
  group.add(alcove);
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

function addContinuousWallJoinery(group, wallZ, towardBoard, materials) {
  const depth = 12.75;
  const centerZ = wallZ + towardBoard * 6.45;
  for (const side of [-1, 1]) {
    addBox(
      group,
      [0.22, 0.58, depth],
      materials.darkStone,
      [side * 7.69, 0.17, centerZ],
      [0, 0, 0],
      'war-room-continuous-stone-skirting',
    );
    const rail = addBox(
      group,
      [0.11, 0.13, depth],
      materials.walnut,
      [side * 7.68, 4.28, centerZ],
      [0, 0, 0],
      'war-room-gallery-picture-rail',
    );
    rail.castShadow = false;
    const brassLine = addBox(
      group,
      [0.12, 0.025, depth * 0.985],
      materials.brass,
      [side * 7.66, 4.34, centerZ],
      [0, 0, 0],
      'war-room-gallery-picture-rail-brass-line',
    );
    brassLine.castShadow = false;
  }
}

export function installWarRoomArchitecturalDepth(group, { wallZ, towardBoard, coarsePointer = false } = {}) {
  if (!group || coarsePointer || !Number.isFinite(wallZ) || !Number.isFinite(towardBoard)) return 0;
  if (group.userData.warRoomArchitecturalDepth === 'v6-monogram-free-gallery') return 0;

  const materials = {
    recess: physical(0x111315, { roughness: 0.96, clearcoat: 0, specularIntensity: 0.08 }),
    stoneTrim: physical(0x756b5f, { roughness: 0.78, clearcoat: 0.035, specularIntensity: 0.2 }),
    darkStone: physical(0x3b3732, { roughness: 0.88, clearcoat: 0.02, specularIntensity: 0.14 }),
    walnut: physical(0x3b2418, { roughness: 0.6, clearcoat: 0.16, clearcoatRoughness: 0.42, specularIntensity: 0.28 }),
    brass: physical(0x8f682c, { metalness: 0.74, roughness: 0.36, clearcoat: 0.16, specularIntensity: 0.62 }),
    carpet: physical(0x321419, { roughness: 0.94, clearcoat: 0.005, sheen: 0.32, sheenColor: 0x6f353d }),
    carpetInner: physical(0x21181a, { roughness: 0.96, clearcoat: 0, sheen: 0.2, sheenColor: 0x4b3035 }),
  };

  const layer = new THREE.Group();
  layer.name = 'war-room-architectural-depth';
  layer.userData.warRoomArchitecturalDepth = 'v6-monogram-free-gallery';
  layer.userData.warRoomArchitecturalDepthMeshBudget = 24;
  layer.userData.warRoomMonogramFree = true;

  addCommandCarpet(layer, materials);
  addContinuousWallJoinery(layer, wallZ, towardBoard, materials);
  addArmorAlcove(layer, -1, wallZ, towardBoard, materials);
  addArmorAlcove(layer, 1, wallZ, towardBoard, materials);

  group.add(layer);
  group.userData.warRoomArchitecturalDepth = 'v6-monogram-free-gallery';
  group.userData.warRoomArchitecturalDepthMeshBudget = 24;
  group.userData.warRoomMonogramFree = true;
  return 24;
}
