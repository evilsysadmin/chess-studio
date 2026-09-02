import * as THREE from 'three';
import { addPremiumWarRoomPaintings } from './WarRoomPremiumPaintings.js';

const CASTLE = Object.freeze({
  stone: 0x655d52,
  stoneLight: 0x918675,
  stoneDark: 0x3d3933,
  grout: 0x24211e,
  recess: 0x17191b,
  walnut: 0x3b2417,
  walnutDark: 0x1b100a,
  brass: 0xb88a3d,
  brassDark: 0x6f4a20,
  parchment: 0xb7a67e,
  leather: 0x321816,
});

const TABLE_PROP_NAMES = Object.freeze([
  'war-table-field-folio',
  'war-table-map-pencil',
  'war-table-command-chronometer',
  'matthias-command-relic',
]);

function material(color, options = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: options.metalness ?? 0.01,
    roughness: options.roughness ?? 0.78,
    clearcoat: options.clearcoat ?? 0.08,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.48,
    specularIntensity: options.specularIntensity ?? 0.28,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
  });
}

function addMesh(group, geometry, mat, position, rotation = [0, 0, 0], name = '') {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (name) mesh.name = name;
  group.add(mesh);
  return mesh;
}

function addBox(group, size, mat, position, name = '') {
  return addMesh(group, new THREE.BoxGeometry(...size), mat, position, [0, 0, 0], name);
}

function addPremiumFloorTiles(floor, wallZ, towardBoard, depth, width) {
  const spacing = 1.62;
  const columns = 9;
  const rows = 8;
  const tileSize = spacing - 0.11;
  const tileGeometry = new THREE.BoxGeometry(tileSize, 0.018, tileSize);
  const warmStone = material(0x827565, {
    roughness: 0.48,
    clearcoat: 0.22,
    clearcoatRoughness: 0.34,
    specularIntensity: 0.42,
  });
  const coolStone = material(0x716b63, {
    roughness: 0.56,
    clearcoat: 0.16,
    clearcoatRoughness: 0.4,
    specularIntensity: 0.36,
  });
  const darkInlay = material(0x49423a, {
    roughness: 0.5,
    clearcoat: 0.2,
    clearcoatRoughness: 0.36,
    specularIntensity: 0.4,
  });

  const totalTiles = columns * rows;
  const warmTiles = new THREE.InstancedMesh(tileGeometry, warmStone, Math.ceil(totalTiles / 2));
  const coolTiles = new THREE.InstancedMesh(tileGeometry, coolStone, Math.floor(totalTiles / 2));
  warmTiles.name = 'war-room-castle-floor-tiles-warm';
  coolTiles.name = 'war-room-castle-floor-tiles-cool';
  warmTiles.castShadow = false;
  coolTiles.castShadow = false;
  warmTiles.receiveShadow = true;
  coolTiles.receiveShadow = true;

  const matrix = new THREE.Matrix4();
  const startX = -((columns - 1) * spacing) / 2;
  let warmIndex = 0;
  let coolIndex = 0;
  for (let row = 0; row < rows; row += 1) {
    const offsetZ = 1.29 + row * spacing;
    const z = wallZ + towardBoard * offsetZ;
    for (let column = 0; column < columns; column += 1) {
      const x = startX + column * spacing;
      const lift = (((row * 2 + column) % 3) - 1) * 0.0015;
      matrix.makeTranslation(x, -0.241 + lift, z);
      if ((row + column) % 2 === 0) {
        warmTiles.setMatrixAt(warmIndex, matrix);
        warmIndex += 1;
      } else {
        coolTiles.setMatrixAt(coolIndex, matrix);
        coolIndex += 1;
      }
    }
  }
  warmTiles.instanceMatrix.needsUpdate = true;
  coolTiles.instanceMatrix.needsUpdate = true;
  floor.add(warmTiles, coolTiles);

  const edgeX = width / 2 - 0.34;
  addBox(floor, [0.16, 0.025, depth - 0.35], darkInlay, [-edgeX, -0.242, wallZ + towardBoard * (depth / 2 - 0.15)], 'war-room-castle-floor-inlay-left');
  addBox(floor, [0.16, 0.025, depth - 0.35], darkInlay, [edgeX, -0.242, wallZ + towardBoard * (depth / 2 - 0.15)], 'war-room-castle-floor-inlay-right');
  addBox(floor, [width - 0.52, 0.025, 0.16], darkInlay, [0, -0.242, wallZ + towardBoard * 0.34], 'war-room-castle-floor-inlay-near');
  addBox(floor, [width - 0.52, 0.025, 0.16], darkInlay, [0, -0.242, wallZ + towardBoard * (depth - 0.36)], 'war-room-castle-floor-inlay-far');

  floor.userData.warRoomPremiumTileCount = totalTiles;
}

function addTiledFloor(group, wallZ, towardBoard, coarsePointer) {
  const floor = new THREE.Group();
  floor.name = 'war-room-castle-floor';
  floor.userData.warRoomSurface = 'stone-tiles';
  floor.userData.warRoomFinish = coarsePointer ? 'simplified-castle-stone' : 'polished-european-stone';

  const depth = 13.6;
  const width = 16.5;
  const centerZ = wallZ + towardBoard * (depth / 2 - 0.15);
  const stone = material(CASTLE.stone, { roughness: 0.78, clearcoat: 0.08, specularIntensity: 0.24 });
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

  if (!coarsePointer) addPremiumFloorTiles(floor, wallZ, towardBoard, depth, width);
  group.add(floor);
}

function createCastleWallTexture(coarsePointer = false) {
  if (coarsePointer) return null;
  const width = 48;
  const height = 96;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const broad = Math.sin(x * 0.31 + y * 0.095) * 8 + Math.cos(y * 0.17) * 7;
      const grain = Math.sin((x + y) * 0.63) * 3 + Math.cos(x * 1.17 - y * 0.21) * 2;
      const fleck = ((x * 17 + y * 29 + x * y * 3) % 19) - 9;
      const value = THREE.MathUtils.clamp(Math.round(214 + broad + grain + fleck * 0.42), 174, 239);
      const index = (y * width + x) * 4;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = 'war-room-warm-limestone-texture';
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.15, 3.4);
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  texture.userData.warRoomWallTexture = 'warm-limestone-plaster-v1';
  return texture;
}

function addSideWalls(group, wallZ, towardBoard, coarsePointer) {
  const walls = new THREE.Group();
  walls.name = 'war-room-castle-side-walls';
  walls.userData.warRoomArchitecture = 'european-castle';

  const depth = coarsePointer ? 8.9 : 13.35;
  const centerZ = wallZ + towardBoard * (depth / 2);
  walls.userData.warRoomDepth = depth;
  const wallTexture = createCastleWallTexture(coarsePointer);
  const wallMaterial = coarsePointer
    ? material(CASTLE.stoneDark, { roughness: 0.9, clearcoat: 0.035, specularIntensity: 0.16 })
    : new THREE.MeshPhysicalMaterial({
        color: 0xa9977b,
        map: wallTexture,
        roughness: 0.74,
        roughnessMap: wallTexture,
        bumpMap: wallTexture,
        bumpScale: 0.014,
        metalness: 0,
        clearcoat: 0.075,
        clearcoatRoughness: 0.62,
        specularIntensity: 0.24,
        envMapIntensity: 0.34,
      });
  wallMaterial.userData.warRoomWallFinish = coarsePointer ? 'simplified-castle-stone' : 'warm-limestone-plaster-v1';
  const trimMaterial = material(coarsePointer ? CASTLE.stoneLight : 0xb7a78e, {
    roughness: coarsePointer ? 0.72 : 0.62,
    clearcoat: coarsePointer ? 0.12 : 0.14,
    specularIntensity: coarsePointer ? 0.3 : 0.34,
  });
  const recessMaterial = material(coarsePointer ? CASTLE.recess : 0x5f5448, { roughness: 0.9, clearcoat: 0.015, specularIntensity: 0.1 });
  const panelMaterial = coarsePointer ? null : material(0x8f806b, {
    roughness: 0.68,
    clearcoat: 0.06,
    clearcoatRoughness: 0.68,
    specularIntensity: 0.2,
  });

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
    wall.userData.warRoomFullDepth = !coarsePointer;

    addBox(walls, [0.18, 0.3, depth * 0.97], trimMaterial, [innerX, -0.06, centerZ]);
    addBox(walls, [0.16, 0.2, depth * 0.96], trimMaterial, [innerX, 5.15, centerZ]);

    const buttressOffsets = coarsePointer
      ? [1.45, 4.5, 7.45]
      : [1.1, 3.1, 5.1, 7.1, 9.1, 11.1, 12.55];
    for (const offset of buttressOffsets) {
      if (offset >= depth - 0.2) continue;
      addBox(walls, [0.18, 4.86, 0.34], trimMaterial, [innerX, 2.48, wallZ + towardBoard * offset]);
    }

    if (!coarsePointer) {
      for (const [index, offset] of [2.15, 6.25, 10.35].entries()) {
        if (offset >= depth - 0.55) continue;
        const panelZ = wallZ + towardBoard * offset;
        const panel = addBox(
          walls,
          [0.055, 2.48, 1.42],
          panelMaterial,
          [side * 7.755, 2.62, panelZ],
          `war-room-castle-wall-panel-${side < 0 ? 'left' : 'right'}-${index + 1}`,
        );
        panel.castShadow = false;
        panel.userData.warRoomWallPanel = 'limestone-inset';
        addBox(walls, [0.075, 0.11, 1.62], trimMaterial, [side * 7.72, 3.91, panelZ]);
        addBox(walls, [0.075, 0.11, 1.62], trimMaterial, [side * 7.72, 1.33, panelZ]);
        addBox(walls, [0.075, 2.68, 0.1], trimMaterial, [side * 7.72, 2.62, panelZ - 0.76]);
        addBox(walls, [0.075, 2.68, 0.1], trimMaterial, [side * 7.72, 2.62, panelZ + 0.76]);
      }
    }
  }

  group.add(walls);
}

function addFolio(consoleGroup, side, coarsePointer) {
  const folio = new THREE.Group();
  folio.name = 'war-room-console-field-folio';
  const leather = material(CASTLE.leather, { roughness: 0.72, clearcoat: 0.08, specularIntensity: 0.2 });
  const paper = material(CASTLE.parchment, { roughness: 0.91, clearcoat: 0.01, specularIntensity: 0.12 });
  const ink = material(0x2a251e, { roughness: 0.98, clearcoat: 0, specularIntensity: 0.04 });
  addMesh(folio, new THREE.BoxGeometry(0.7, 0.035, 0.98), leather, [0, 1.02, -0.47], [0, side * 0.05, 0]);
  addMesh(folio, new THREE.BoxGeometry(0.59, 0.018, 0.84), paper, [0.02, 1.055, -0.44], [0, side * 0.035, 0.012]);
  if (!coarsePointer) {
    for (let index = 0; index < 4; index += 1) {
      addMesh(folio, new THREE.BoxGeometry(0.38 - index * 0.035, 0.004, 0.012), ink,
        [-0.06 + index * 0.02, 1.067 + index * 0.001, -0.67 + index * 0.15], [0, side * 0.035, 0]);
    }
  }
  consoleGroup.add(folio);
}

function addPawnRelic(consoleGroup, coarsePointer) {
  const relic = new THREE.Group();
  relic.name = 'war-room-console-matthias-relic';
  const dark = material(0x16191e, { metalness: 0.08, roughness: 0.74, clearcoat: 0.05 });
  const brass = material(CASTLE.brass, { metalness: 0.82, roughness: 0.3, clearcoat: 0.22 });
  addMesh(relic, new THREE.CylinderGeometry(0.18, 0.22, 0.07, coarsePointer ? 12 : 22), brass, [0, 1.02, 0.48]);
  addMesh(relic, new THREE.CylinderGeometry(0.105, 0.145, 0.28, coarsePointer ? 12 : 22), dark, [0, 1.2, 0.48]);
  addMesh(relic, new THREE.SphereGeometry(0.12, coarsePointer ? 12 : 20, coarsePointer ? 8 : 14), material(0x80684d, { roughness: 0.86 }), [0, 1.41, 0.48]);
  addMesh(relic, new THREE.CylinderGeometry(0.14, 0.16, 0.05, coarsePointer ? 12 : 22), dark, [0, 1.52, 0.48]);
  consoleGroup.add(relic);
}

function addChronometer(consoleGroup, coarsePointer) {
  const watch = new THREE.Group();
  watch.name = 'war-room-console-command-chronometer';
  const brass = material(CASTLE.brass, { metalness: 0.9, roughness: 0.34, clearcoat: 0.2 });
  const face = material(0x91876e, { roughness: 0.84, clearcoat: 0.03, specularIntensity: 0.13 });
  const dark = material(0x15171a, { metalness: 0.12, roughness: 0.72 });
  addMesh(watch, new THREE.CylinderGeometry(0.2, 0.2, 0.05, coarsePointer ? 16 : 28), brass, [0, 1.03, -0.5]);
  addMesh(watch, new THREE.CylinderGeometry(0.16, 0.16, 0.014, coarsePointer ? 16 : 28), face, [0, 1.065, -0.5]);
  if (!coarsePointer) {
    addMesh(watch, new THREE.BoxGeometry(0.014, 0.006, 0.11), dark, [0, 1.075, -0.53], [0, 0.42, 0]);
    addMesh(watch, new THREE.BoxGeometry(0.01, 0.007, 0.075), dark, [0, 1.077, -0.5], [0, -0.72, 0]);
  }
  consoleGroup.add(watch);
}

function addMapPencil(consoleGroup) {
  const pencil = new THREE.Group();
  pencil.name = 'war-room-console-map-pencil';
  const wood = material(0x7a4b27, { roughness: 0.8, clearcoat: 0.03 });
  const tip = material(0x25201c, { roughness: 0.95, clearcoat: 0 });
  addMesh(pencil, new THREE.CylinderGeometry(0.018, 0.018, 0.76, 10), wood, [0.02, 1.055, 0.45], [Math.PI / 2, 0, 0.16]);
  addMesh(pencil, new THREE.ConeGeometry(0.024, 0.09, 10), tip, [0.08, 1.055, 0.82], [Math.PI / 2, 0, 0.16]);
  consoleGroup.add(pencil);
}

function addSideConsoles(group, wallZ, towardBoard, coarsePointer) {
  const furniture = new THREE.Group();
  furniture.name = 'war-room-side-consoles';
  const wood = material(CASTLE.walnut, { roughness: 0.62, clearcoat: 0.16, clearcoatRoughness: 0.4, specularIntensity: 0.28 });
  const woodDark = material(CASTLE.walnutDark, { roughness: 0.76, clearcoat: 0.08, clearcoatRoughness: 0.5, specularIntensity: 0.2 });
  const brass = material(CASTLE.brassDark, { metalness: 0.72, roughness: 0.34, clearcoat: 0.18 });
  const z = wallZ + towardBoard * (coarsePointer ? 4.05 : 4.75);

  for (const side of [-1, 1]) {
    const consoleGroup = new THREE.Group();
    consoleGroup.name = side < 0 ? 'war-room-side-console-left' : 'war-room-side-console-right';
    consoleGroup.userData.warRoomFurniture = 'side-console';
    consoleGroup.position.set(side * 6.92, 0, z);

    addBox(consoleGroup, [0.84, 0.13, 2.35], wood, [0, 0.91, 0], 'war-room-side-console-top');
    addBox(consoleGroup, [0.9, 0.045, 2.38], brass, [0, 0.995, 0]);
    for (const localX of [-0.29, 0.29]) {
      for (const localZ of [-0.89, 0.89]) {
        addBox(consoleGroup, [0.09, 0.85, 0.09], woodDark, [localX, 0.45, localZ]);
      }
    }
    addBox(consoleGroup, [0.09, 0.14, 1.78], woodDark, [side * -0.27, 0.34, 0]);

    if (side < 0) {
      addFolio(consoleGroup, side, coarsePointer);
      addPawnRelic(consoleGroup, coarsePointer);
    } else {
      addChronometer(consoleGroup, coarsePointer);
      addMapPencil(consoleGroup);
    }
    furniture.add(consoleGroup);
  }

  group.add(furniture);
}

function sceneRoot(object) {
  let current = object;
  while (current?.parent) current = current.parent;
  return current;
}

function retireWarTableClutter(root) {
  if (!root || root.userData?.warRoomTableClutterRetired) return;
  for (const name of TABLE_PROP_NAMES) {
    const object = root.getObjectByName?.(name);
    if (!object) continue;
    object.visible = false;
    object.userData.relocatedToRoomDecor = true;
  }
  root.userData.warRoomTableClutterRetired = true;
}

function ensureWarmBounceLight(root, fireplace, coarsePointer) {
  let bounce = root.getObjectByName?.('war-room-fire-bounce-light');
  if (bounce) return bounce;
  bounce = new THREE.PointLight(0xffa85c, coarsePointer ? 0.55 : 1.15, coarsePointer ? 4.6 : 6.2, 2);
  bounce.name = 'war-room-fire-bounce-light';
  bounce.position.set(0, 0.92, 0.72);
  bounce.castShadow = false;
  fireplace.add(bounce);
  return bounce;
}

function animateWarmFire(root, coarsePointer) {
  const fireCore = root?.getObjectByName?.('war-room-fire-core');
  const light = root?.getObjectByName?.('war-room-fire-light');
  const fireplace = root?.getObjectByName?.('war-room-fireplace');
  if (!fireCore || !light || !fireplace) return;

  const legacyAnchor = fireCore.children.find((child) => child?.userData?.warRoomFireAnimationAnchor);
  if (legacyAnchor?.onBeforeRender && !legacyAnchor.userData.castleDriverOwnsFire) {
    // Three.js calls onBeforeRender unconditionally for renderable objects.
    // Replacing the old fire driver with null crashes the entire War Room.
    // Keep the hook callable while handing motion to the castle scene driver.
    legacyAnchor.onBeforeRender = () => {};
    legacyAnchor.userData.castleDriverOwnsFire = true;
  }

  const flames = fireCore.children.filter((child) => child?.isMesh);
  if (!flames.length) return;

  if (!fireCore.userData.castleFireBases) {
    fireCore.userData.castleFireBases = flames.map((flame) => ({
      x: flame.position.x,
      y: flame.position.y,
      z: flame.position.z,
      rotationZ: flame.rotation.z,
      scaleX: flame.scale.x,
      scaleY: flame.scale.y,
      scaleZ: flame.scale.z,
      emissiveIntensity: flame.material?.emissiveIntensity ?? 1.5,
    }));
    fireCore.userData.warRoomWarmFireAnimated = true;
  }

  const now = typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
  const lowPower = coarsePointer ? 0.62 : 1;
  const slow = Math.sin(now * 0.0047);
  const medium = Math.sin(now * 0.0113 + 1.17);
  const fast = Math.sin(now * 0.0271 + 0.44);
  const irregular = Math.sin(now * 0.0189 + Math.sin(now * 0.0017) * 2.3);
  const flutter = slow * 0.07 + medium * 0.055 + fast * 0.035 + irregular * 0.025;
  const baseIntensity = light.userData.baseWarRoomIntensity || (coarsePointer ? 2.8 : 4.55);

  light.intensity = baseIntensity * (1 + flutter * lowPower);
  light.color.setHSL(0.068 + irregular * 0.006, 0.94, 0.56 + slow * 0.025);

  const bounce = ensureWarmBounceLight(root, fireplace, coarsePointer);
  bounce.intensity = (coarsePointer ? 0.55 : 1.15) * (1 + (slow * 0.09 + medium * 0.05) * lowPower);
  bounce.color.setHSL(0.078 + medium * 0.004, 0.88, 0.62);

  flames.forEach((flame, index) => {
    const base = fireCore.userData.castleFireBases[index];
    if (!base) return;
    const phase = index * 1.31;
    const wave = Math.sin(now * (0.0083 + index * 0.00065) + phase);
    const tremor = Math.sin(now * (0.022 + index * 0.00105) + phase * 0.73);
    const lick = Math.sin(now * (0.034 + index * 0.0017) + phase * 1.9);
    flame.position.x = base.x + tremor * 0.012 * lowPower;
    flame.position.y = base.y + (wave * 0.032 + lick * 0.012) * lowPower;
    flame.position.z = base.z + tremor * 0.008 * lowPower;
    flame.rotation.z = base.rotationZ + (wave * 0.105 + tremor * 0.038) * lowPower;
    flame.scale.set(
      base.scaleX * (1 - tremor * 0.08 * lowPower),
      base.scaleY * (1 + (wave * 0.16 + lick * 0.055) * lowPower),
      base.scaleZ * (1 - wave * 0.055 * lowPower),
    );
    if (flame.material) {
      flame.material.emissiveIntensity = base.emissiveIntensity * (1 + (medium * 0.12 + lick * 0.08) * lowPower);
    }
  });

  const embers = fireplace.children.filter((child) => child?.name === 'war-room-fire-ember' || child?.material?.emissive?.getHex?.() === 0xff4a13);
  for (let index = 0; index < embers.length; index += 1) {
    const ember = embers[index];
    if (!ember.material) continue;
    if (ember.userData.castleBaseEmissive == null) ember.userData.castleBaseEmissive = ember.material.emissiveIntensity || 0.8;
    ember.material.emissiveIntensity = ember.userData.castleBaseEmissive * (1 + 0.2 * Math.sin(now * 0.0064 + index * 1.83));
  }
}

function attachSceneDriver(layer, coarsePointer) {
  const driver = layer.getObjectByName('war-room-castle-floor-slab');
  if (!driver) return;
  driver.userData.warRoomCastleSceneDriver = true;
  driver.onBeforeRender = () => {
    const root = sceneRoot(driver);
    retireWarTableClutter(root);
    animateWarmFire(root, coarsePointer);
  };
}

export function buildCastleArchitectureLayer({ wallZ, towardBoard, coarsePointer = false } = {}) {
  const layer = new THREE.Group();
  layer.name = 'war-room-castle-architecture';
  layer.userData.warRoomArchitecture = 'european-castle';
  addTiledFloor(layer, wallZ, towardBoard, coarsePointer);
  addSideWalls(layer, wallZ, towardBoard, coarsePointer);
  addSideConsoles(layer, wallZ, towardBoard, coarsePointer);
  addPremiumWarRoomPaintings(layer, { wallZ, towardBoard, coarsePointer });
  attachSceneDriver(layer, coarsePointer);
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
