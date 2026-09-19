import * as THREE from 'three';
import { CHRONICLES_MAP } from './chroniclesOfMatthias.js';

const CELL = 4;
const TEXTURE_SIZE = 96;
const FLOOR_SHELL_LIFT = 0.025;
const CEILING_GROUND_BOUNCE = 0x3e2b1d;

function textureNoise(x, y, seed) {
  let value = Math.imul(x + seed * 17, 374761393) ^ Math.imul(y + seed * 29, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) & 0xff;
}

function surfaceSample(pattern, x, y, seed) {
  const noise = textureNoise(x, y, seed);
  const broad = Math.sin((x + seed * 3) * 0.14) * 9 + Math.cos((y - seed) * 0.17) * 8;
  let value = 214 + (noise - 128) * 0.18 + broad;
  let joint = false;
  let edge = false;

  if (pattern === 'masonry') {
    const courseHeight = 18;
    const course = Math.floor(y / courseHeight);
    const localY = y % courseHeight;
    const localX = (x + (course % 2) * 18) % 36;
    joint = localY < 2 || localX < 2;
    edge = localY < 5 || localX < 5;
    if (joint) value = 96 + noise * 0.075;
    else if (edge) value -= 19;
    if (((x * 3 + y * 7 + seed) % 113) < 3) value -= 32;
  } else if (pattern === 'flagstone') {
    const bandHeight = 36;
    const band = Math.floor(y / bandHeight);
    const localY = y % bandHeight;
    const localX = (x + (band % 2) * 13) % 36;
    joint = localY < 2 || localX < 2;
    edge = localY < 6 || localX < 6;
    if (joint) value = 116 + noise * 0.05;
    else if (edge) value -= 17;
    const wornCenter = Math.abs(localX - 18) + Math.abs(localY - 18) < 12;
    if (wornCenter) value += 7;
  } else if (pattern === 'worn') {
    const scratch = ((x * 5 + y * 3 + seed) % 37) === 0;
    const pock = ((x * 11 + y * 17 + seed * 3) % 97) < 3;
    if (scratch) value -= 36;
    if (pock) value -= 22;
  }

  return { noise, value, joint, edge };
}

function createDungeonSurfaceTexture({ pattern, seed, repeat = [1, 1], kind = 'albedo' }) {
  const data = new Uint8Array(TEXTURE_SIZE * TEXTURE_SIZE * 4);

  for (let y = 0; y < TEXTURE_SIZE; y += 1) {
    for (let x = 0; x < TEXTURE_SIZE; x += 1) {
      const sample = surfaceSample(pattern, x, y, seed);
      let value = sample.value;
      let red;
      let green;
      let blue;

      if (kind === 'roughness') {
        value = sample.joint ? 244 : sample.edge ? 230 : 205 + (sample.noise - 128) * 0.08;
        red = green = blue = value;
      } else if (kind === 'height') {
        value = sample.joint ? 72 : sample.edge ? sample.value - 18 : sample.value;
        red = green = blue = value;
      } else {
        const mineral = (sample.noise - 128) * 0.035;
        red = value + mineral + 4;
        green = value + mineral * 0.45;
        blue = value - mineral - 6;
        if (sample.joint) {
          red -= 11;
          green -= 9;
          blue -= 7;
        }
      }

      const offset = (y * TEXTURE_SIZE + x) * 4;
      data[offset] = Math.max(42, Math.min(252, Math.round(red)));
      data[offset + 1] = Math.max(42, Math.min(252, Math.round(green)));
      data[offset + 2] = Math.max(42, Math.min(252, Math.round(blue)));
      data[offset + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(data, TEXTURE_SIZE, TEXTURE_SIZE, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(...repeat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = kind === 'albedo' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function surfaceMaps(pattern, seed, repeat) {
  return {
    map: createDungeonSurfaceTexture({ pattern, seed, repeat, kind: 'albedo' }),
    bumpMap: createDungeonSurfaceTexture({ pattern, seed, repeat, kind: 'height' }),
    roughnessMap: createDungeonSurfaceTexture({ pattern, seed, repeat, kind: 'roughness' }),
  };
}

function material(color, options = {}) {
  const surface = options.surface
    ? surfaceMaps(options.surface.pattern, options.surface.seed, options.surface.repeat)
    : null;
  const mat = new THREE.MeshPhysicalMaterial({
    color,
    metalness: options.metalness ?? 0.04,
    roughness: options.roughness ?? 0.82,
    clearcoat: options.clearcoat ?? 0.03,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.64,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    depthWrite: options.depthWrite ?? true,
    map: surface?.map ?? null,
    bumpMap: surface?.bumpMap ?? null,
    roughnessMap: surface?.roughnessMap ?? null,
    bumpScale: options.bumpScale ?? (surface ? 0.045 : 0),
  });

  if (surface) {
    let texturesDisposed = false;
    mat.addEventListener('dispose', () => {
      if (texturesDisposed) return;
      texturesDisposed = true;
      surface.map.dispose();
      surface.bumpMap.dispose();
      surface.roughnessMap.dispose();
    });
  }

  return mat;
}

function add(group, geometry, mat, position, rotation = [0, 0, 0], name = '') {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function cellWorld(x, y) {
  return [(x - 3) * CELL, (y - 3) * CELL];
}

function addRubble(root, stoneMat, x, y, index, coarsePointer) {
  const [wx, wz] = cellWorld(x, y);
  const count = coarsePointer ? 2 : 5;
  for (let piece = 0; piece < count; piece += 1) {
    const size = 0.13 + ((index + piece * 3) % 4) * 0.045;
    add(
      root,
      new THREE.DodecahedronGeometry(size, 0),
      stoneMat,
      [wx - 1.35 + piece * 0.19, size * 0.54, wz + 1.25 - (piece % 2) * 0.16],
      [piece * 0.31, piece * 0.53, piece * 0.17],
      `chronicles-rubble-${index}-${piece}`,
    );
  }
}

function addCeilingRib(root, stoneMat, x, y, index, coarsePointer) {
  const [wx, wz] = cellWorld(x, y);
  const segments = coarsePointer ? 3 : 7;
  for (let segment = 0; segment < segments; segment += 1) {
    const t = segments === 1 ? 0.5 : segment / (segments - 1);
    const angle = Math.PI * (0.13 + 0.74 * t);
    const archX = Math.cos(angle) * 1.74;
    const archY = 2.23 + Math.sin(angle) * 1.35;
    add(
      root,
      new THREE.BoxGeometry(0.29, 0.32, CELL * 0.94),
      stoneMat,
      [wx + archX, archY, wz],
      [0, 0, angle - Math.PI / 2],
      `chronicles-ceiling-rib-${index}-${segment}`,
    );
  }
}

function addTransverseVaultRib(root, stoneMat, x, y, index, coarsePointer) {
  const [wx, wz] = cellWorld(x, y);

  // A shallow continuous archivolt sits behind the individual voussoirs. It
  // closes the negative gaps in first-person perspective so the carved blocks
  // read as one structural rib instead of a row of floating stones.
  const archivolt = add(
    root,
    new THREE.TorusGeometry(1.72, coarsePointer ? 0.065 : 0.082, 6, coarsePointer ? 16 : 28, Math.PI),
    stoneMat,
    [wx, 2.18, wz],
    [0, Math.PI / 2, 0],
    `chronicles-entry-vault-archivolt-${index}`,
  );
  archivolt.scale.y = 1.34 / 1.72;

  const segments = coarsePointer ? 7 : 13;
  for (let segment = 0; segment < segments; segment += 1) {
    const t = segments === 1 ? 0.5 : segment / (segments - 1);
    const angle = Math.PI * (0.12 + 0.76 * t);
    const archZ = Math.cos(angle) * 1.72;
    const archY = 2.18 + Math.sin(angle) * 1.34;
    add(
      root,
      new THREE.BoxGeometry(coarsePointer ? 0.2 : 0.17, 0.27, coarsePointer ? 0.4 : 0.44),
      stoneMat,
      [wx, archY, wz + archZ],
      [angle - Math.PI / 2, 0, 0],
      `chronicles-entry-vault-rib-${index}-${segment}`,
    );
  }

  add(
    root,
    new THREE.BoxGeometry(coarsePointer ? 0.28 : 0.34, 0.24, 0.46),
    stoneMat,
    [wx, 3.51, wz],
    [0, 0, 0],
    `chronicles-entry-vault-keystone-${index}`,
  );
}

function addCryptCrest(root, iron, rune, x, y, index) {
  const [wx, wz] = cellWorld(x, y);
  const crest = new THREE.Group();
  crest.name = `chronicles-crypt-crest-${index}`;
  crest.position.set(wx, 1.7, wz - 1.82);
  add(crest, new THREE.CircleGeometry(0.38, 20), iron, [0, 0, 0], [0, 0, 0], `chronicles-crypt-crest-disc-${index}`);
  add(crest, new THREE.BoxGeometry(0.09, 0.54, 0.05), rune, [-0.13, 0.01, 0.035], [0, 0, -0.55], `chronicles-crypt-crest-slash-a-${index}`);
  add(crest, new THREE.BoxGeometry(0.09, 0.54, 0.05), rune, [0.13, 0.01, 0.035], [0, 0, 0.55], `chronicles-crypt-crest-slash-b-${index}`);
  root.add(crest);
}

function addFloorPuddle(root, wetMat, x, y, scaleX, scaleZ, rotation, index) {
  const [wx, wz] = cellWorld(x, y);
  const puddle = add(
    root,
    new THREE.CircleGeometry(0.78, 28),
    wetMat,
    [wx + 0.48, 0.018, wz - 0.42],
    [-Math.PI / 2, 0, rotation],
    `chronicles-floor-puddle-${index}`,
  );
  puddle.scale.set(scaleX, scaleZ, 1);
  puddle.castShadow = false;
  puddle.renderOrder = 2;
}

function addWallAge(root, grimeMat, mineralMat, px, pz, rotY, horizontal, outward, index) {
  const dripCount = 2 + (index % 2);
  for (let drip = 0; drip < dripCount; drip += 1) {
    const lateral = -1.08 + drip * 0.82 + ((index * 7 + drip * 5) % 4) * 0.08;
    const height = 0.46 + ((index + drip * 3) % 4) * 0.17;
    const x = horizontal ? px + lateral : px + outward * 0.018;
    const z = horizontal ? pz + outward * 0.018 : pz + lateral;
    const stain = add(
      root,
      new THREE.BoxGeometry(horizontal ? 0.16 : 0.025, height, horizontal ? 0.025 : 0.16),
      grimeMat,
      [x, 2.68 - height * 0.5, z],
      [0, rotY, 0],
      `chronicles-wall-grime-${index}-${drip}`,
    );
    stain.castShadow = false;
  }

  if (index % 3 === 0) {
    const bloom = add(
      root,
      new THREE.BoxGeometry(horizontal ? 0.5 : 0.024, 0.22, horizontal ? 0.024 : 0.5),
      mineralMat,
      [horizontal ? px + 0.82 : px + outward * 0.02, 0.76, horizontal ? pz + outward * 0.02 : pz + 0.82],
      [0, rotY, 0],
      `chronicles-wall-mineral-bloom-${index}`,
    );
    bloom.castShadow = false;
  }
}

function addWallNiche(root, backingMat, frameMat, urnMat, px, pz, rotY, index) {
  const niche = new THREE.Group();
  niche.name = `chronicles-wall-niche-${index}`;
  niche.position.set(px, 1.48, pz);
  niche.rotation.y = rotY;

  const backing = add(niche, new THREE.BoxGeometry(1.05, 1.5, 0.035), backingMat, [0, 0, 0], [0, 0, 0], `chronicles-wall-niche-backing-${index}`);
  backing.castShadow = false;
  add(niche, new THREE.BoxGeometry(0.11, 1.5, 0.12), frameMat, [-0.58, 0, 0.045], [0, 0, 0], `chronicles-wall-niche-frame-left-${index}`);
  add(niche, new THREE.BoxGeometry(0.11, 1.5, 0.12), frameMat, [0.58, 0, 0.045], [0, 0, 0], `chronicles-wall-niche-frame-right-${index}`);
  add(niche, new THREE.TorusGeometry(0.58, 0.065, 8, 24, Math.PI), frameMat, [0, 0.75, 0.045], [0, 0, 0], `chronicles-wall-niche-arch-${index}`);
  add(niche, new THREE.CylinderGeometry(0.16, 0.21, 0.42, 12), urnMat, [0, -0.49, 0.12], [0, 0, 0], `chronicles-wall-niche-urn-${index}`);
  add(niche, new THREE.SphereGeometry(0.12, 10, 8), urnMat, [0, -0.24, 0.12], [0, 0, 0], `chronicles-wall-niche-urn-cap-${index}`);
  root.add(niche);
}

function addHangingChain(root, iron, px, pz, rotY, index) {
  const chain = new THREE.Group();
  chain.name = `chronicles-hanging-chain-${index}`;
  chain.position.set(px, 2.72, pz);
  chain.rotation.y = rotY;
  for (let link = 0; link < 7; link += 1) {
    const ring = add(
      chain,
      new THREE.TorusGeometry(0.095, 0.022, 6, 12),
      iron,
      [0.1 * Math.sin(link * 0.8), -link * 0.19, 0.09],
      [0, link % 2 ? Math.PI / 2 : 0, link * 0.04],
      `chronicles-hanging-chain-link-${index}-${link}`,
    );
    ring.castShadow = false;
  }
  root.add(chain);
}

function addSarcophagus(root, baseMat, lidMat, px, pz, rotY, horizontal, outward, index) {
  const tomb = new THREE.Group();
  tomb.name = `chronicles-sarcophagus-${index}`;
  const offset = 0.48;
  tomb.position.set(horizontal ? px : px + outward * offset, 0.18, horizontal ? pz + outward * offset : pz);
  tomb.rotation.y = rotY;
  add(tomb, new THREE.BoxGeometry(1.55, 0.34, 0.72), baseMat, [0, 0, 0], [0, 0, 0], `chronicles-sarcophagus-base-${index}`);
  add(tomb, new THREE.BoxGeometry(1.42, 0.16, 0.64), lidMat, [0, 0.25, 0], [0, 0, 0], `chronicles-sarcophagus-lid-${index}`);
  add(tomb, new THREE.BoxGeometry(0.62, 0.045, 0.05), baseMat, [0, 0.36, 0], [0, 0, 0], `chronicles-sarcophagus-sigil-${index}`);
  root.add(tomb);
}

function addDrainGrate(root, iron, x, y, index) {
  const [wx, wz] = cellWorld(x, y);
  const drain = new THREE.Group();
  drain.name = `chronicles-drain-${index}`;
  drain.position.set(wx - 0.72, 0.018, wz + 0.74);
  add(drain, new THREE.BoxGeometry(0.9, 0.025, 0.09), iron, [0, 0, -0.36], [0, 0, 0], `chronicles-drain-frame-a-${index}`).castShadow = false;
  add(drain, new THREE.BoxGeometry(0.9, 0.025, 0.09), iron, [0, 0, 0.36], [0, 0, 0], `chronicles-drain-frame-b-${index}`).castShadow = false;
  add(drain, new THREE.BoxGeometry(0.09, 0.025, 0.82), iron, [-0.41, 0, 0], [0, 0, 0], `chronicles-drain-frame-c-${index}`).castShadow = false;
  add(drain, new THREE.BoxGeometry(0.09, 0.025, 0.82), iron, [0.41, 0, 0], [0, 0, 0], `chronicles-drain-frame-d-${index}`).castShadow = false;
  for (let bar = -2; bar <= 2; bar += 1) {
    add(drain, new THREE.BoxGeometry(0.055, 0.03, 0.72), iron, [bar * 0.15, 0.006, 0], [0, 0, 0], `chronicles-drain-bar-${index}-${bar + 2}`).castShadow = false;
  }
  root.add(drain);
}

function addHeroSpot(root, { color, intensity, distance, angle, position, target, name, castShadow }) {
  const light = new THREE.SpotLight(color, intensity, distance, angle, 0.62, 1.55);
  light.position.set(...position);
  light.target.position.set(...target);
  light.name = name;
  light.castShadow = castShadow;
  if (castShadow) {
    light.shadow.mapSize.set(512, 512);
    light.shadow.bias = -0.0008;
    light.shadow.normalBias = 0.035;
    light.shadow.camera.near = 0.4;
    light.shadow.camera.far = distance;
  }
  root.add(light, light.target);
  return light;
}

export function chroniclesWalkableCells() {
  const cells = [];
  CHRONICLES_MAP.forEach((row, y) => {
    [...row].forEach((tile, x) => {
      if (tile !== '#') cells.push({ x, y, tile });
    });
  });
  return cells;
}

export function chroniclesExposedWallFaces() {
  const faces = [];
  const dirs = [
    { dx: 0, dy: -1, side: 'north' },
    { dx: 1, dy: 0, side: 'east' },
    { dx: 0, dy: 1, side: 'south' },
    { dx: -1, dy: 0, side: 'west' },
  ];
  CHRONICLES_MAP.forEach((row, y) => {
    [...row].forEach((tile, x) => {
      if (tile !== '#') return;
      dirs.forEach((dir) => {
        const neighbor = CHRONICLES_MAP[y + dir.dy]?.[x + dir.dx];
        if (neighbor && neighbor !== '#') faces.push({ x, y, side: dir.side });
      });
    });
  });
  return faces;
}

export function buildChroniclesDungeonDressing({ coarsePointer = false } = {}) {
  const root = new THREE.Group();
  root.name = 'chronicles-dungeon-dressing';

  const floorMat = material(0x505354, {
    roughness: 0.88,
    surface: { pattern: 'flagstone', seed: 11, repeat: [1.3, 1.3] },
    bumpScale: 0.075,
  });
  const floorAlt = material(0x414547, {
    roughness: 0.92,
    surface: { pattern: 'flagstone', seed: 23, repeat: [1.3, 1.3] },
    bumpScale: 0.07,
  });
  const floorInset = material(0x343a3d, {
    roughness: 0.92,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
    surface: { pattern: 'worn', seed: 31, repeat: [1.35, 1.2] },
    bumpScale: 0.032,
  });
  const wallStone = material(0x687073, {
    roughness: 0.89,
    surface: { pattern: 'masonry', seed: 41, repeat: [1.08, 1] },
    bumpScale: 0.11,
  });
  const wallStoneAlt = material(0x555d60, {
    roughness: 0.92,
    surface: { pattern: 'masonry', seed: 53, repeat: [1.08, 1] },
    bumpScale: 0.1,
  });
  const edgeMat = material(0x596064, {
    roughness: 0.88,
    surface: { pattern: 'worn', seed: 67, repeat: [1.05, 1.05] },
    bumpScale: 0.05,
  });
  const wallAccent = material(0x737576, {
    roughness: 0.84,
    surface: { pattern: 'worn', seed: 79, repeat: [1.05, 1.05] },
    bumpScale: 0.045,
  });
  // Keep the masonry neutral enough that warm torchlight and the colder crypt
  // fills define the scene's palette instead of baking a permanent brown cast
  // into every surface. Relief, wear and procedural texture remain unchanged.
  const iron = material(0x302e2f, { metalness: 0.68, roughness: 0.37, clearcoat: 0.08 });
  const rune = material(0xa96a2b, { metalness: 0.46, roughness: 0.32, emissive: 0x4b1d05, emissiveIntensity: 0.55 });
  const wetStone = material(0x151b1d, { roughness: 0.24, clearcoat: 0.96, clearcoatRoughness: 0.12, transparent: true, opacity: 0.7, depthWrite: false });
  const grime = material(0x171715, { roughness: 1, transparent: true, opacity: 0.5, depthWrite: false });
  const mineral = material(0x6c6a5b, { roughness: 0.96, transparent: true, opacity: 0.42, depthWrite: false });
  const nicheVoid = material(0x0b0d0e, { roughness: 1 });
  const urnStone = material(0x8d8373, { roughness: 0.78, surface: { pattern: 'worn', seed: 97, repeat: [1.1, 1.1] }, bumpScale: 0.03 });

  const readabilityFill = new THREE.HemisphereLight(0x91a2b2, CEILING_GROUND_BOUNCE, coarsePointer ? 0.78 : 0.52);
  readabilityFill.name = 'chronicles-readability-fill';
  root.add(readabilityFill);

  chroniclesWalkableCells().forEach(({ x, y }, index) => {
    const [wx, wz] = cellWorld(x, y);
    const slab = add(
      root,
      new THREE.BoxGeometry(CELL * 0.94, 0.12, CELL * 0.94),
      (x + y) % 2 ? floorMat : floorAlt,
      [wx, -0.08 + FLOOR_SHELL_LIFT, wz],
      [0, ((x * 7 + y * 11) % 3 - 1) * 0.008, 0],
      `chronicles-floor-slab-${index}`,
    );
    slab.position.y -= ((x * 13 + y * 5) % 4) * 0.012;

    if (!coarsePointer) {
      const insetWidth = CELL * (0.42 + (index % 3) * 0.025);
      const insetDepth = CELL * (0.39 + ((index + 1) % 3) * 0.03);
      const inset = add(
        root,
        new THREE.BoxGeometry(insetWidth, 0.012, insetDepth),
        floorInset,
        [wx + ((index % 2) - 0.5) * 0.08, -0.006 + FLOOR_SHELL_LIFT, wz],
        [0, ((index % 3) - 1) * 0.018, 0],
        `chronicles-floor-inset-${index}`,
      );
      inset.castShadow = false;
      inset.renderOrder = 1;
    }
    if (!coarsePointer && index % 3 === 0) {
      add(root, new THREE.BoxGeometry(CELL * 0.52, 0.018, 0.025), edgeMat, [wx + 0.28, 0.004, wz - 0.35], [0, 0.35, 0], `chronicles-floor-crack-${index}`);
    }
  });

  if (!coarsePointer) {
    addFloorPuddle(root, wetStone, 1, 5, 1.18, 0.58, -0.18, 0);
    addFloorPuddle(root, wetStone, 5, 3, 0.78, 0.42, 0.48, 1);
    addFloorPuddle(root, wetStone, 3, 2, 0.62, 0.34, -0.64, 2);
    addDrainGrate(root, iron, 3, 5, 0);
    addDrainGrate(root, iron, 1, 3, 1);
  }

  chroniclesExposedWallFaces().forEach(({ x, y, side }, index) => {
    const [wx, wz] = cellWorld(x, y);
    const horizontal = side === 'north' || side === 'south';
    const outward = side === 'north' ? -1 : side === 'south' ? 1 : side === 'east' ? 1 : -1;
    const surfaceOffset = CELL / 2 + 0.045;
    const detailOffset = CELL / 2 + 0.118;
    const surfaceX = horizontal ? wx : wx + outward * surfaceOffset;
    const surfaceZ = horizontal ? wz + outward * surfaceOffset : wz;
    const px = horizontal ? wx : wx + outward * detailOffset;
    const pz = horizontal ? wz + outward * detailOffset : wz;
    const rotY = horizontal ? 0 : Math.PI / 2;
    const facingYaw = side === 'north' ? Math.PI : side === 'south' ? 0 : side === 'east' ? Math.PI / 2 : -Math.PI / 2;
    const faceMat = index % 3 === 0 ? wallAccent : edgeMat;
    const surfaceMat = index % 3 === 0 ? wallStone : wallStoneAlt;

    add(
      root,
      new THREE.BoxGeometry(CELL * 0.965, 3.3, 0.08),
      surfaceMat,
      [surfaceX, 1.7, surfaceZ],
      [0, rotY, 0],
      `chronicles-wall-surface-${index}`,
    );
    add(root, new THREE.BoxGeometry(CELL * 0.9, 0.2, 0.11), faceMat, [px, 0.5, pz], [0, rotY, 0], `chronicles-wall-course-low-${index}`);
    add(root, new THREE.BoxGeometry(CELL * 0.9, 0.14, 0.1), faceMat, [px, 2.22, pz], [0, rotY, 0], `chronicles-wall-course-high-${index}`);
    add(root, new THREE.BoxGeometry(CELL * 0.36, 0.12, 0.13), edgeMat, [px, 1.38, pz], [0, rotY, 0], `chronicles-wall-keystone-${index}`);
    add(root, new THREE.BoxGeometry(CELL * 0.96, 0.18, 0.13), edgeMat, [px, 3.26, pz], [0, rotY, 0], `chronicles-wall-crown-${index}`);

    if (!coarsePointer) {
      if (index % 2 === 0) {
        const pillarX = horizontal ? px - 1.55 : px;
        const pillarZ = horizontal ? pz : pz - 1.55;
        add(root, new THREE.BoxGeometry(0.3, 2.72, 0.26), edgeMat, [pillarX, 1.38, pillarZ], [0, rotY, 0], `chronicles-wall-pilaster-${index}`);
        add(root, new THREE.BoxGeometry(0.44, 0.2, 0.38), wallAccent, [pillarX, 2.77, pillarZ], [0, rotY, 0], `chronicles-wall-pilaster-cap-${index}`);
      }
      if (index % 4 === 1) {
        const reliefX = horizontal ? px + 1.18 : px;
        const reliefZ = horizontal ? pz : pz + 1.18;
        add(root, new THREE.BoxGeometry(0.6, 0.36, 0.09), wallAccent, [reliefX, 1.44, reliefZ], [0, rotY, 0], `chronicles-wall-relief-${index}`);
      }
      addWallAge(root, grime, mineral, px, pz, rotY, horizontal, outward, index);

      // One offset memorial niche breaks the opening corridor's mirror symmetry
      // and gives the first encounter a memorable landmark without narrowing the
      // walkable space. Keep it desktop-only with the rest of the premium dressing.
      const nicheFace = (x === 0 && y === 3 && side === 'east')
        || (x === 6 && y === 3 && side === 'west')
        || (x === 2 && y === 2 && side === 'south')
        || (x === 3 && y === 6 && side === 'north');
      if (nicheFace) addWallNiche(root, nicheVoid, wallAccent, urnStone, px, pz, facingYaw, index);

      const chainFace = (x === 0 && y === 4 && side === 'east') || (x === 6 && y === 2 && side === 'west');
      if (chainFace) addHangingChain(root, iron, px, pz, facingYaw, index);

      const tombFace = (x === 6 && y === 5 && side === 'west') || (x === 4 && y === 4 && side === 'east');
      if (tombFace) addSarcophagus(root, edgeMat, wallAccent, px, pz, facingYaw, horizontal, outward, index);
    }
  });

  [[1, 3], [5, 3], [5, 5]].forEach(([x, y], index) => {
    const [wx, wz] = cellWorld(x, y);
    add(root, new THREE.TorusGeometry(0.24, 0.035, 8, coarsePointer ? 14 : 22), iron, [wx - 1.55, 1.72, wz], [Math.PI / 2, 0, 0], `chronicles-chain-ring-${index}`);
  });

  [[1, 2], [5, 2], [1, 5], [5, 5]].forEach(([x, y], index) => addRubble(root, edgeMat, x, y, index, coarsePointer));
  [[3, 2], [3, 4]].forEach(([x, y], index) => addCeilingRib(root, edgeMat, x, y, index, coarsePointer));

  // The opening east-west corridor now uses true transverse ribs: the arch
  // crosses the passage instead of stretching along the player's sightline.
  // Three shallow bays give Book I a crypt silhouette without narrowing the
  // walkable volume or changing collision/gameplay.
  if (coarsePointer) {
    addTransverseVaultRib(root, edgeMat, 3, 5, 0, true);
  } else {
    [2, 3, 4].forEach((x, index) => addTransverseVaultRib(root, index === 1 ? wallAccent : edgeMat, x, 5, index, false));
  }

  if (!coarsePointer) {
    addCeilingRib(root, wallAccent, 1, 3, 3, false);
    addCeilingRib(root, wallAccent, 5, 3, 4, false);
    addCryptCrest(root, iron, rune, 1, 1, 0);
    addCryptCrest(root, iron, rune, 5, 1, 1);
  }

  const [sigilX, sigilZ] = cellWorld(3, 4);
  add(root, new THREE.TorusGeometry(1.14, 0.045, 8, coarsePointer ? 22 : 36), rune, [sigilX, 0.012, sigilZ], [-Math.PI / 2, 0, 0], 'chronicles-sigil-outer-ring');
  for (let index = 0; index < 4; index += 1) {
    add(
      root,
      new THREE.BoxGeometry(0.56, 0.025, 0.055),
      rune,
      [sigilX, 0.016, sigilZ],
      [0, index * (Math.PI / 4), 0],
      `chronicles-sigil-spoke-${index}`,
    );
  }

  const sigilLight = new THREE.PointLight(0xb84c18, coarsePointer ? 0.8 : 1.05, 8, 2);
  sigilLight.position.set(sigilX, 0.68, sigilZ);
  sigilLight.name = 'chronicles-sigil-light';
  root.add(sigilLight);

  const gateRelief = new THREE.Group();
  gateRelief.name = 'chronicles-gate-relief';
  const [gateX, gateZ] = cellWorld(3, 1);
  gateRelief.position.set(gateX, 0, gateZ - 1.28);
  add(gateRelief, new THREE.TorusGeometry(0.86, 0.09, 10, coarsePointer ? 22 : 36), iron, [0, 1.7, 0], [0, 0, 0], 'chronicles-gate-outer-rune');
  add(gateRelief, new THREE.TorusGeometry(0.58, 0.055, 8, coarsePointer ? 18 : 28), rune, [0, 1.7, 0.03], [0, 0, 0], 'chronicles-gate-inner-rune');
  add(gateRelief, new THREE.BoxGeometry(1.72, 0.07, 0.08), iron, [0, 0.98, 0], [0, 0, 0], 'chronicles-gate-threshold');
  add(gateRelief, new THREE.BoxGeometry(0.42, 0.3, 0.16), wallAccent, [0, 2.73, -0.02], [0, 0, 0], 'chronicles-gate-keystone');
  add(gateRelief, new THREE.BoxGeometry(2.25, 0.16, 0.15), wallAccent, [0, 2.48, -0.04], [0, 0, 0], 'chronicles-gate-lintel');
  root.add(gateRelief);

  const gateLight = new THREE.PointLight(0xd46b28, coarsePointer ? 0.92 : 1.24, 9, 2);
  gateLight.position.set(gateX, 1.55, gateZ - 0.88);
  gateLight.name = 'chronicles-gate-light';
  root.add(gateLight);

  const [coldX, coldZ] = cellWorld(3, 5);
  const coldFill = new THREE.PointLight(0x557a92, coarsePointer ? 0.62 : 0.82, 12, 2);
  coldFill.position.set(coldX, 1.2, coldZ);
  coldFill.name = 'chronicles-crypt-cold-fill';
  root.add(coldFill);

  const gateKey = addHeroSpot(root, {
    color: 0xff8a3c,
    intensity: coarsePointer ? 2.2 : 3.1,
    distance: 18,
    angle: Math.PI * 0.24,
    position: [gateX, 2.75, gateZ - 0.35],
    target: [sigilX, 0.85, sigilZ + 1.2],
    name: 'chronicles-gate-key',
    castShadow: !coarsePointer,
  });
  const cryptRim = addHeroSpot(root, {
    color: 0x6d96b6,
    intensity: coarsePointer ? 1.25 : 1.7,
    distance: 14,
    angle: Math.PI * 0.31,
    position: [coldX, 2.95, coldZ + 0.8],
    target: [sigilX, 1.2, sigilZ],
    name: 'chronicles-crypt-rim',
    castShadow: false,
  });

  root.userData.chroniclesRuneMaterials = [rune];
  root.userData.chroniclesAccentLights = [sigilLight, gateLight, coldFill, gateKey, cryptRim];
  root.userData.chroniclesReadabilityLight = readabilityFill;
  root.userData.chroniclesSurfaceContract = {
    floorShellLift: FLOOR_SHELL_LIFT,
    ceilingGroundBounce: CEILING_GROUND_BOUNCE,
  };
  return root;
}
