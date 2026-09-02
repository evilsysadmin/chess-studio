import * as THREE from 'three';

const CASTLE = Object.freeze({
  stone: 0x655d52,
  stoneLight: 0x918675,
  stoneDark: 0x3d3933,
  grout: 0x24211e,
  recess: 0x17191b,
});

function material(color, options = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: options.metalness ?? 0.01,
    roughness: options.roughness ?? 0.78,
    clearcoat: options.clearcoat ?? 0.08,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.48,
    specularIntensity: options.specularIntensity ?? 0.28,
  });
}

function addBox(group, size, mat, position, name = '') {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (name) mesh.name = name;
  group.add(mesh);
  return mesh;
}

function addTiledFloor(group, wallZ, towardBoard, coarsePointer) {
  const floor = new THREE.Group();
  floor.name = 'war-room-castle-floor';
  floor.userData.warRoomSurface = 'stone-tiles';

  const depth = 13.6;
  const width = 16.5;
  const centerZ = wallZ + towardBoard * (depth / 2 - 0.15);
  const stone = material(CASTLE.stone, { roughness: 0.86, clearcoat: 0.05, specularIntensity: 0.2 });
  const grout = material(CASTLE.grout, { roughness: 0.98, clearcoat: 0, specularIntensity: 0.06 });

  addBox(floor, [width, 0.09, depth], stone, [0, -0.305, centerZ], 'war-room-castle-floor-slab');

  const spacing = coarsePointer ? 2.55 : 1.62;
  for (let x = -7.3; x <= 7.3; x += spacing) {
    const line = addBox(floor, [0.026, 0.012, depth - 0.16], grout, [x, -0.254, centerZ]);
    line.castShadow = false;
  }
  for (let offset = 0.48; offset < depth - 0.25; offset += spacing) {
    const z = wallZ + towardBoard * offset;
    const line = addBox(floor, [width - 0.18, 0.012, 0.026], grout, [0, -0.253, z]);
    line.castShadow = false;
  }

  group.add(floor);
}

function addSideWalls(group, wallZ, towardBoard, coarsePointer) {
  const walls = new THREE.Group();
  walls.name = 'war-room-castle-side-walls';
  walls.userData.warRoomArchitecture = 'european-castle';

  const depth = coarsePointer ? 8.9 : 10.2;
  const centerZ = wallZ + towardBoard * (depth / 2);
  const wallMaterial = material(CASTLE.stoneDark, { roughness: 0.9, clearcoat: 0.035, specularIntensity: 0.16 });
  const trimMaterial = material(CASTLE.stoneLight, { roughness: 0.72, clearcoat: 0.12, specularIntensity: 0.3 });
  const recessMaterial = material(CASTLE.recess, { roughness: 0.96, clearcoat: 0, specularIntensity: 0.04 });

  for (const side of [-1, 1]) {
    const wallX = side * 8.0;
    const innerX = side * 7.77;
    const wall = addBox(
      walls,
      [0.42, 5.75, depth],
      wallMaterial,
      [wallX, 2.38, centerZ],
      side < 0 ? 'war-room-castle-wall-left' : 'war-room-castle-wall-right',
    );
    wall.userData.warRoomWallSide = side < 0 ? 'left' : 'right';

    addBox(walls, [0.18, 0.3, depth * 0.97], trimMaterial, [innerX, -0.06, centerZ]);
    addBox(walls, [0.16, 0.2, depth * 0.96], trimMaterial, [innerX, 5.15, centerZ]);

    const buttressOffsets = coarsePointer ? [1.45, 4.5, 7.45] : [1.1, 3.1, 5.1, 7.1, 9.05];
    for (const offset of buttressOffsets) {
      if (offset >= depth - 0.2) continue;
      addBox(walls, [0.18, 4.86, 0.34], trimMaterial, [innerX, 2.48, wallZ + towardBoard * offset]);
    }

    if (!coarsePointer) {
      for (const offset of [2.08, 6.18]) {
        if (offset >= depth - 0.4) continue;
        const slit = addBox(walls, [0.035, 1.38, 0.34], recessMaterial, [side * 7.755, 3.25, wallZ + towardBoard * offset]);
        slit.castShadow = false;
      }
    }
  }

  group.add(walls);
}

export function buildCastleArchitectureLayer({ wallZ, towardBoard, coarsePointer = false } = {}) {
  const layer = new THREE.Group();
  layer.name = 'war-room-castle-architecture';
  layer.userData.warRoomArchitecture = 'european-castle';
  addTiledFloor(layer, wallZ, towardBoard, coarsePointer);
  addSideWalls(layer, wallZ, towardBoard, coarsePointer);
  return layer;
}

export function applyCastleFurnitureLayout(root, { wallZ, towardBoard } = {}) {
  const sofaZ = wallZ + towardBoard * 4.25;
  let moved = 0;
  for (const [name, side] of [['war-room-sofa-left', -1], ['war-room-sofa-right', 1]]) {
    const sofa = root?.getObjectByName?.(name);
    if (!sofa) continue;
    sofa.position.set(side * 6.48, 0.02, sofaZ);
    sofa.rotation.y = -side * towardBoard * Math.PI / 2;
    sofa.userData.warRoomFurniturePlacement = 'side-wall';
    sofa.userData.facesWarTable = true;
    moved += 1;
  }
  return moved;
}
