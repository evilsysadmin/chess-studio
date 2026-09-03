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

function addTiledFloor(group, wallZ, towardBoard, coarsePointer) {
  const floor = new THREE.Group();
  floor.name = 'war-room-castle-floor';
  floor.userData.warRoomSurface = coarsePointer ? 'stone-tiles' : 'stone-slab';
  floor.userData.warRoomFinish = coarsePointer ? 'simplified-castle-stone' : 'restrained-limestone-slab';

  const depth = 13.6;
  const width = 16.5;
  const centerZ = wallZ + towardBoard * (depth / 2 - 0.15);
  const stone = coarsePointer
    ? material(CASTLE.stone, { roughness: 0.78, clearcoat: 0.08, specularIntensity: 0.24 })
    : material(0x8b8173, {
        roughness: 0.6,
        clearcoat: 0.12,
        clearcoatRoughness: 0.5,
        specularIntensity: 0.3,
      });
  const grout = material(coarsePointer ? CASTLE.grout : 0x675f55, {
    roughness: 0.92,
    clearcoat: 0,
    specularIntensity: coarsePointer ? 0.06 : 0.1,
  });

  addBox(floor, [width, 0.09, depth], stone, [0, -0.305, centerZ], 'war-room-castle-floor-slab');

  const spacing = coarsePointer ? 2.55 : 4.18;
  const jointWidth = coarsePointer ? 0.026 : 0.016;
  const xStart = coarsePointer ? -7.3 : -6.25;
  const xEnd = coarsePointer ? 7.3 : 6.25;
  for (let x = xStart; x <= xEnd; x += spacing) {
    const line = addBox(floor, [jointWidth, 0.01, depth - 0.16], grout, [x, -0.254, centerZ], 'war-room-castle-floor-joint-longitudinal');
    line.castShadow = false;
  }
  for (let offset = coarsePointer ? 0.48 : 2.05; offset < depth - 0.25; offset += spacing) {
    const z = wallZ + towardBoard * offset;
    const line = addBox(floor, [width - 0.18, 0.01, jointWidth], grout, [0, -0.253, z], 'war-room-castle-floor-joint-transverse');
    line.castShadow = false;
  }
  floor.userData.warRoomJointSpacing = spacing;
  group.add(floor);
}

function createCastleWallTexture(coarsePointer = false) {
  if (coarsePointer) return null;
  const width = 96;
  const height = 96;
  const data = new Uint8Array(width * height * 4);
  const courseHeight = 12;

  for (let y = 0; y < height; y += 1) {
    const course = Math.floor(y / courseHeight);
    const localY = y % courseHeight;
    const horizontalMortar = localY <= 1 || localY >= courseHeight - 1;
    const stagger = course % 2 ? 13 : 0;
    for (let x = 0; x < width; x += 1) {
      const localX = (x + stagger) % 26;
      const verticalMortar = localX <= 1;
      const mortar = horizontalMortar || verticalMortar;
      const broad = Math.sin(x * 0.19 + y * 0.071) * 11 + Math.cos(y * 0.13) * 8;
      const grain = Math.sin((x + y) * 0.57) * 4 + Math.cos(x * 0.83 - y * 0.19) * 3;
      const base = mortar ? 66 : 171 + broad + grain;
      const index = (y * width + x) * 4;
      data[index] = THREE.MathUtils.clamp(Math.round(base * 0.92), 42, 205);
      data[index + 1] = THREE.MathUtils.clamp(Math.round(base * 0.88), 40, 198);
      data[index + 2] = THREE.MathUtils.clamp(Math.round(base * 0.8), 36, 188);
      data[index + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = 'war-room-dark-germanic-ashlar';
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.5, 3.25);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  texture.userData.warRoomWallTexture = 'dark-germanic-ashlar-v3';
  texture.userData.resolution = [width, height];
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
    ? material(0x403b35, { roughness: 0.92, clearcoat: 0.025, specularIntensity: 0.14 })
    : new THREE.MeshPhysicalMaterial({
        color: 0x686057,
        map: wallTexture,
        roughness: 0.84,
        roughnessMap: wallTexture,
        bumpMap: wallTexture,
        bumpScale: 0.022,
        metalness: 0,
        clearcoat: 0.035,
        clearcoatRoughness: 0.72,
        specularIntensity: 0.19,
        envMapIntensity: 0.28,
      });
  wallMaterial.userData.warRoomWallFinish = coarsePointer ? 'simplified-dark-castle-stone' : 'dark-germanic-ashlar-v3';
  const trimMaterial = material(coarsePointer ? 0x6c655d : 0x817667, {
    roughness: coarsePointer ? 0.8 : 0.76,
    clearcoat: 0.05,
    specularIntensity: coarsePointer ? 0.2 : 0.24,
  });
  const panelMaterial = coarsePointer ? null : material(0x514a42, {
    roughness: 0.88,
    clearcoat: 0.025,
    clearcoatRoughness: 0.8,
    specularIntensity: 0.14,
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
        panel.userData.warRoomWallPanel = 'dark-ashlar-inset';
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
  const offsetFromWall = coarsePointer ? 4.05 : 2.55;
  const z = wallZ + towardBoard * offsetFromWall;

  for (const side of [-1, 1]) {
    const consoleGroup = new THREE.Group();
    consoleGroup.name = side < 0 ? 'war-room-side-console-left' : 'war-room-side-console-right';
    consoleGroup.userData.warRoomFurniture = 'side-console';
    consoleGroup.userData.warRoomOffsetFromWall = offsetFromWall;
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

function addArmorGuard(group, side, wallZ, towardBoard, coarsePointer) {
  const guard = new THREE.Group();
  guard.name = side < 0 ? 'war-room-armor-guard-left' : 'war-room-armor-guard-right';
  guard.userData.warRoomDecor = 'human-scale-plate-armor';
  guard.userData.warRoomScaleReference = 'two-piece-heights';
  guard.userData.warRoomNominalHeight = 2.22;

  const segments = coarsePointer ? 10 : 16;
  const steel = material(0x666b6d, { metalness: 0.82, roughness: 0.32, clearcoat: 0.24, specularIntensity: 0.66 });
  const steelDark = material(0x303538, { metalness: 0.74, roughness: 0.42, clearcoat: 0.14, specularIntensity: 0.48 });
  const leather = material(0x2b1712, { roughness: 0.76, clearcoat: 0.06, specularIntensity: 0.18 });
  const brass = material(0x80602d, { metalness: 0.74, roughness: 0.34, clearcoat: 0.18, specularIntensity: 0.5 });

  for (const legX of [-0.15, 0.15]) {
    addMesh(guard, new THREE.CylinderGeometry(0.085, 0.11, 0.63, segments), steelDark, [legX, 0.44, 0]);
    addMesh(guard, new THREE.SphereGeometry(0.105, segments, coarsePointer ? 7 : 10), steel, [legX, 0.77, 0]);
    addBox(guard, [0.23, 0.1, 0.34], steelDark, [legX, 0.1, towardBoard * 0.06]);
  }

  addMesh(guard, new THREE.CylinderGeometry(0.27, 0.34, 0.78, segments), steel, [0, 1.18, 0]);
  addBox(guard, [0.42, 0.08, 0.28], brass, [0, 1.02, towardBoard * 0.02]);
  addMesh(guard, new THREE.SphereGeometry(0.19, segments, coarsePointer ? 8 : 12), steelDark, [0, 1.72, 0]);
  addMesh(guard, new THREE.CylinderGeometry(0.2, 0.22, 0.14, segments), steel, [0, 1.86, 0]);
  addBox(guard, [0.34, 0.055, 0.12], steelDark, [0, 1.82, towardBoard * 0.16], 'war-room-armor-visor');
  addMesh(guard, new THREE.ConeGeometry(0.055, 0.2, segments), brass, [0, 2.04, 0]);

  for (const armSide of [-1, 1]) {
    addMesh(guard, new THREE.SphereGeometry(0.13, segments, coarsePointer ? 7 : 10), steel, [armSide * 0.33, 1.48, 0]);
    addMesh(guard, new THREE.CylinderGeometry(0.065, 0.085, 0.55, segments), steelDark, [armSide * 0.4, 1.18, 0], [0, 0, armSide * 0.13]);
    addMesh(guard, new THREE.SphereGeometry(0.075, segments, coarsePointer ? 7 : 9), leather, [armSide * 0.42, 0.92, towardBoard * 0.02]);
  }

  const sword = new THREE.Group();
  sword.name = 'war-room-armor-zweihander';
  const blade = addMesh(sword, new THREE.BoxGeometry(0.055, 1.62, 0.025), steel, [0, 0.55, 0]);
  blade.castShadow = !coarsePointer;
  addBox(sword, [0.52, 0.055, 0.055], brass, [0, -0.27, 0], 'war-room-armor-sword-crossguard');
  addMesh(sword, new THREE.CylinderGeometry(0.035, 0.04, 0.43, segments), leather, [0, -0.5, 0]);
  addMesh(sword, new THREE.SphereGeometry(0.065, segments, coarsePointer ? 7 : 9), brass, [0, -0.74, 0]);
  sword.position.set(side * 0.43, 0.82, towardBoard * 0.18);
  sword.rotation.z = side * -0.11;
  guard.add(sword);

  guard.position.set(side * 6.92, 0, wallZ + towardBoard * (coarsePointer ? 2.9 : 3.35));
  guard.rotation.y = -side * towardBoard * 0.16;
  group.add(guard);
  return guard;
}

function refinePremiumGallery(group, towardBoard, coarsePointer) {
  if (coarsePointer) return;
  const left = group.getObjectByName('war-room-premium-painting-0');
  const right = group.getObjectByName('war-room-premium-painting-1');
  if (left) {
    left.scale.set(0.9, 1.08, 1);
    left.position.y += 0.08;
    left.userData.warRoomGalleryVariant = 'alpine-fortress';
  }
  if (right) {
    right.scale.set(1.08, 0.93, 1);
    right.position.y -= 0.05;
    right.userData.warRoomGalleryVariant = 'rhine-castle';
  }

  const gold = material(0x8c672e, { metalness: 0.7, roughness: 0.31, clearcoat: 0.2, specularIntensity: 0.52 });
  if (left) {
    const finial = addMesh(left, new THREE.ConeGeometry(0.11, 0.23, 12), gold, [0, 1.06, towardBoard * 0.13], [0, 0, 0], 'war-room-gallery-finial');
    finial.castShadow = false;
  }
  if (right) {
    const crest = addMesh(right, new THREE.CylinderGeometry(0.12, 0.12, 0.035, 16), gold, [0, 1.03, towardBoard * 0.13], [Math.PI / 2, 0, 0], 'war-room-gallery-medallion');
    crest.castShadow = false;
  }
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
    if (flame.material) flame.material.emissiveIntensity = base.emissiveIntensity * (1 + (medium * 0.12 + lick * 0.08) * lowPower);
  });

  const embers = fireplace.children.filter((child) => child?.name === 'war-room-fire-ember' || child?.material?.emissive?.getHex?.() === 0xff4a13);
  for (let index = 0; index < embers.length; index += 1) {
    const ember = embers[index];
    if (!ember.material) continue;
    if (ember.userData.castleBaseEmissive == null) ember.userData.castleBaseEmissive = ember.material.emissiveIntensity || 0.8;
    ember.material.emissiveIntensity = ember.userData.castleBaseEmissive * (1 + 0.2 * Math.sin(now * 0.0064 + index * 1.83));
  }
}

function finalizeCoarseFurnitureBalance(root, wallZ, towardBoard) {
  if (!root || root.userData?.warRoomFurnitureBalance === 'centered-v3') return;
  const sofaOffset = 6.45;
  const consoleOffset = 3.7;

  for (const [name, side] of [['war-room-sofa-left', -1], ['war-room-sofa-right', 1]]) {
    const sofa = root.getObjectByName?.(name);
    if (!sofa) continue;
    sofa.position.set(side * 6.28, 0.02, wallZ + towardBoard * sofaOffset);
    sofa.rotation.y = -side * towardBoard * Math.PI / 2;
    sofa.userData.warRoomOffsetFromWall = sofaOffset;
    sofa.userData.warRoomFurniturePlacement = 'side-wall-centered-v3';
    sofa.userData.facesWarTable = true;
  }

  for (const [name, side] of [['war-room-side-console-left', -1], ['war-room-side-console-right', 1]]) {
    const consoleGroup = root.getObjectByName?.(name);
    if (!consoleGroup) continue;
    consoleGroup.position.set(side * 6.72, 0, wallZ + towardBoard * consoleOffset);
    consoleGroup.userData.warRoomOffsetFromWall = consoleOffset;
    consoleGroup.userData.warRoomFurniturePlacement = 'side-console-centered-v3';
  }
  root.userData.warRoomFurnitureBalance = 'centered-v3';
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

function attachCoarseFinalRefinementDriver(layer, wallZ, towardBoard) {
  const driver = layer.getObjectByName('war-room-armor-visor') || layer.getObjectByName('war-room-armor-guard-right');
  if (!driver) return;
  driver.userData.warRoomFinalRefinementDriver = true;
  driver.userData.warRoomFinalRefinementScope = 'coarse-mobile-only';
  const previous = driver.onBeforeRender;
  driver.onBeforeRender = (...args) => {
    previous?.(...args);
    finalizeCoarseFurnitureBalance(sceneRoot(driver), wallZ, towardBoard);
  };
}

export function buildCastleArchitectureLayer({ wallZ, towardBoard, coarsePointer = false } = {}) {
  const layer = new THREE.Group();
  layer.name = 'war-room-castle-architecture';
  layer.userData.warRoomArchitecture = 'european-castle';
  layer.userData.warRoomCastleStyle = 'dark-germanic-ashlar-v3';
  addTiledFloor(layer, wallZ, towardBoard, coarsePointer);
  addSideWalls(layer, wallZ, towardBoard, coarsePointer);
  addSideConsoles(layer, wallZ, towardBoard, coarsePointer);
  addPremiumWarRoomPaintings(layer, { wallZ, towardBoard, coarsePointer });
  refinePremiumGallery(layer, towardBoard, coarsePointer);
  addArmorGuard(layer, -1, wallZ, towardBoard, coarsePointer);
  addArmorGuard(layer, 1, wallZ, towardBoard, coarsePointer);
  attachSceneDriver(layer, coarsePointer);
  if (coarsePointer) {
    attachCoarseFinalRefinementDriver(layer, wallZ, towardBoard);
  } else {
    layer.userData.warRoomDesktopLegacyLayoutDriverRetired = true;
  }
  return layer;
}

export function applyCastleFurnitureLayout(root, { wallZ, towardBoard } = {}) {
  const sofaOffsetFromWall = 5.45;
  const sofaZ = wallZ + towardBoard * sofaOffsetFromWall;
  let moved = 0;
  for (const [name, side] of [['war-room-sofa-left', -1], ['war-room-sofa-right', 1]]) {
    const sofa = root?.getObjectByName?.(name);
    if (!sofa) continue;
    sofa.position.set(side * 6.48, 0.02, sofaZ);
    sofa.rotation.y = -side * towardBoard * Math.PI / 2;
    sofa.userData.warRoomFurniturePlacement = 'side-wall';
    sofa.userData.warRoomOffsetFromWall = sofaOffsetFromWall;
    sofa.userData.facesWarTable = true;
    moved += 1;
  }
  return moved;
}
