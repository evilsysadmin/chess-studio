import * as THREE from 'three';

// Authored in grid coordinates: future map collision must reserve these footprints.
export const SWORDHAVEN_BUILDINGS = Object.freeze([
  Object.freeze({ id: 'swordhaven-forge', label: 'Armería', x: 4, y: 5, roof: 0x8a4632, emblem: 'swords' }),
  Object.freeze({ id: 'swordhaven-armor', label: 'Armaduras', x: 14, y: 5, roof: 0x4a657e, emblem: 'shield' }),
  Object.freeze({ id: 'swordhaven-tavern', label: 'Taberna', x: 4, y: 13, roof: 0x995e37, emblem: 'mug' }),
  Object.freeze({ id: 'swordhaven-magic', label: 'Magia', x: 14, y: 13, roof: 0x554481, emblem: 'crystal' }),
  Object.freeze({ id: 'swordhaven-temple', label: 'Templo', x: 9, y: 3, roof: 0x65758a, emblem: 'sun' }),
]);

const CELL = 4;

export const SWORDHAVEN_INTERACTION_CELLS = Object.freeze([
  Object.freeze({ id: 'swordhaven-forge', x: 4, y: 7 }),
  Object.freeze({ id: 'swordhaven-armor', x: 14, y: 7 }),
  Object.freeze({ id: 'swordhaven-tavern', x: 4, y: 15 }),
  Object.freeze({ id: 'swordhaven-magic', x: 14, y: 15 }),
  Object.freeze({ id: 'swordhaven-temple', x: 9, y: 5 }),
]);

export const SWORDHAVEN_SPAWN = Object.freeze({ x: 9, y: 16, direction: 0 });
export const SWORDHAVEN_GATE_CELL = Object.freeze({ x: 9, y: 17 });

// Grid is the collision contract for the eventually-authored manifest:
// no visual houses/trees/fountain may occupy a walkable tile.
export function createSwordhavenWalkGrid() {
  const size = 19;
  const grid = Array.from({ length: size }, (_, y) => (
    Array.from({ length: size }, (_, x) => (
      x === 0 || y === 0 || x === size - 1 || y === size - 1 ? '#' : '.'
    ))
  ));
  SWORDHAVEN_BUILDINGS.forEach(({ x, y }) => {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) grid[y + dy][x + dx] = '#';
    }
  });
  // The fountain and tree-trunks are real obstacles, not hidden hitboxes.
  grid[9][9] = '#';
  for (const [x, y] of [[1,1],[17,1],[1,17],[17,17],[3,9],[15,9],[7,16],[12,16]]) {
    grid[y][x] = '#';
  }
  return Object.freeze(grid.map(row => row.join('')));
}

const material = (color, extra = {}) => new THREE.MeshStandardMaterial({
  color, roughness: 0.86, metalness: 0.03, ...extra,
});


let cachedGrassTexture = null;

// Reusable, deterministic meadow texture. Smooth patches and fine grain break
// the solid-green prototype look without any external image or canvas.
export function swordhavenGrassTexture() {
  if (cachedGrassTexture) return cachedGrassTexture;
  const size = 128;
  const pixels = new Uint8Array(size * size * 4);
  const hash = (x, y) => {
    let value = Math.imul(x + 113, 0x1f123bb5) ^ Math.imul(y + 397, 0x5f356495);
    value ^= value >>> 13;
    value = Math.imul(value, 0x85ebca6b);
    return ((value ^ (value >>> 16)) >>> 0) / 0xffffffff;
  };
  const noise = (x, y, cells) => {
    const u = x * cells / size;
    const v = y * cells / size;
    const x0 = Math.floor(u);
    const y0 = Math.floor(v);
    const fx = (u - x0) ** 2 * (3 - 2 * (u - x0));
    const fy = (v - y0) ** 2 * (3 - 2 * (v - y0));
    const sample = (dx, dy) => hash((x0 + dx) % cells, (y0 + dy) % cells);
    const a = sample(0, 0) * (1 - fx) + sample(1, 0) * fx;
    const b = sample(0, 1) * (1 - fx) + sample(1, 1) * fx;
    return a * (1 - fy) + b * fy;
  };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const meadow = noise(x, y, 5) - 0.5;
      const clover = noise(x, y, 17) - 0.5;
      const grain = hash(x, y) - 0.5;
      const warmth = meadow * 35 + clover * 15 + grain * 13;
      const index = (y * size + x) * 4;
      pixels[index] = Math.round(103 + warmth * 0.9 + clover * 15);
      pixels[index + 1] = Math.round(127 + warmth);
      pixels[index + 2] = Math.round(73 + warmth * 0.57 + meadow * 11);
      pixels[index + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.name = 'swordhaven-meadow-grass-texture';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(7, 7);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  cachedGrassTexture = texture;
  return texture;
}


const cachedTownSurfaceTextures = new Map();

// One authored-style set of tiny texture patterns for the five storefronts.
// Reused across buildings/runs: no material-per-brick or new draw calls.
export function swordhavenSurfaceTexture(kind) {
  if (!['stucco', 'masonry', 'roof', 'timber'].includes(kind)) {
    throw new Error('Unsupported Swordhaven material: ' + kind);
  }
  if (cachedTownSurfaceTextures.has(kind)) return cachedTownSurfaceTextures.get(kind);
  const size = 128;
  const pixels = new Uint8Array(size * size * 4);
  const hash = (x, y) => {
    let n = Math.imul(x + 229, 0x27d4eb2d) ^ Math.imul(y + 31, 0x165667b1);
    n ^= n >>> 15;
    return ((n ^ (n >>> 11)) >>> 0) / 0xffffffff;
  };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const grain = hash(x, y) - 0.5;
      const blur = (hash(Math.floor(x / 7), Math.floor(y / 7)) - 0.5);
      let tone;
      if (kind === 'stucco') {
        // Fine limewash speckles and broad weathered patches.
        tone = 235 + blur * 20 + grain * 12;
      } else if (kind === 'masonry') {
        // Staggered courses; each stone varies independently and mortar is
        // recessed, rather than painting a grid over every building face.
        const row = Math.floor(y / 24);
        const sx = (x + (row % 2) * 17) % 34;
        const sy = y % 24;
        const stone = hash(Math.floor((x + (row % 2) * 17) / 34), row);
        tone = sx < 2 || sy < 2 ? 167 : 221 + stone * 26 + grain * 10;
      } else if (kind === 'roof') {
        const row = Math.floor(y / 16);
        const sx = (x + (row % 2) * 11) % 22;
        const sy = y % 16;
        const tile = hash(Math.floor((x + (row % 2) * 11) / 22), row);
        tone = sx < 1 || sy < 2 ? 173 : 224 + tile * 28 + grain * 5;
      } else {
        // Directional fibres for heavy dark-oak beams and doors.
        tone = 221 + Math.sin(y * 0.46 + blur * 3) * 11 + blur * 17 + grain * 7;
      }
      const value = Math.max(0, Math.min(255, Math.round(tone)));
      const index = (y * size + x) * 4;
      pixels[index] = pixels[index + 1] = pixels[index + 2] = value;
      pixels[index + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.name = 'swordhaven-' + kind + '-surface';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(kind === 'stucco' ? 2 : 3, kind === 'stucco' ? 2 : 3);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  cachedTownSurfaceTextures.set(kind, texture);
  return texture;
}

// The dome moves with the camera but never rotates with it: the sun stays in
// the same compass direction and the horizon remains stable while walking.
export function createSwordhavenSkyDome(sunDirection) {
  const geometry = new THREE.SphereGeometry(62, 64, 32);
  const coords = geometry.getAttribute('position');
  const colors = [];
  const direction = new THREE.Vector3();
  const zenith = new THREE.Color(0x65a6d0);
  const horizon = new THREE.Color(0xb8dce9);
  const warm = new THREE.Color(0xffe4b0);
  const color = new THREE.Color();
  for (let i = 0; i < coords.count; i += 1) {
    direction.fromBufferAttribute(coords, i).normalize();
    const altitude = THREE.MathUtils.smoothstep(direction.y, -0.08, 0.75);
    const sunlight = Math.pow(Math.max(direction.dot(sunDirection), 0), 30) * 0.54;
    color.copy(horizon).lerp(zenith, altitude).lerp(warm, sunlight);
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const sky = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    color: 0xffffff, side: THREE.BackSide, vertexColors: true,
    fog: false, toneMapped: false, depthWrite: false,
  }));
  sky.name = 'swordhaven-sky-dome';
  sky.renderOrder = -100;
  sky.frustumCulled = false;
  const solarFacing = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1), sunDirection,
  );
  for (const [name, radius, opacity, order] of [
    ['swordhaven-sun-halo', 5.6, 0.22, -99],
    ['swordhaven-sun-disc', 1.45, 1, -98],
  ]) {
    const glow = new THREE.Mesh(new THREE.CircleGeometry(radius, 32),
      new THREE.MeshBasicMaterial({
        color: name === 'swordhaven-sun-disc' ? 0xfff8db : 0xffdfb2,
        transparent: opacity < 1, opacity, depthWrite: false,
        depthTest: true, fog: false, toneMapped: false, side: THREE.DoubleSide,
      }));
    glow.name = name;
    glow.renderOrder = order;
    glow.position.copy(sunDirection).multiplyScalar(name === 'swordhaven-sun-disc' ? 57.5 : 59);
    glow.quaternion.copy(solarFacing);
    sky.add(glow);
  }
  sky.onBeforeRender = (_renderer, _scene, camera) => {
    sky.position.copy(camera.position);
    sky.updateMatrixWorld();
  };
  return sky;
}

function mesh(group, geometry, mat, name, position, shadow = false) {
  const piece = new THREE.Mesh(geometry, mat);
  piece.name = name;
  piece.position.set(...position);
  piece.castShadow = shadow;
  piece.receiveShadow = true;
  group.add(piece);
  return piece;
}

function worldPoint(x, y, center) {
  return [(x - center.x) * CELL, (y - center.y) * CELL];
}

function emblem(group, kind, mats) {
  const gold = mats.gold;
  if (kind === 'swords') {
    for (const tilt of [-0.65, 0.65]) {
      const sword = mesh(group, new THREE.BoxGeometry(0.11, 0.9, 0.1), gold, 'crossed-sword', [0, 0, 0.1]);
      sword.rotation.z = tilt;
    }
  } else if (kind === 'shield') {
    const shape = new THREE.Shape();
    shape.moveTo(-0.4, 0.35); shape.lineTo(0.4, 0.35); shape.lineTo(0.32, -0.2);
    shape.lineTo(0, -0.52); shape.lineTo(-0.32, -0.2); shape.closePath();
    mesh(group, new THREE.ShapeGeometry(shape), gold, 'shield-emblem', [0, 0, 0.1]);
  } else if (kind === 'mug') {
    mesh(group, new THREE.BoxGeometry(0.57, 0.57, 0.12), gold, 'tankard', [-0.1, 0, 0.1]);
    mesh(group, new THREE.TorusGeometry(0.2, 0.06, 5, 12), gold, 'tankard-handle', [0.31, 0, 0.1]);
  } else if (kind === 'crystal') {
    mesh(group, new THREE.OctahedronGeometry(0.45, 0),
      material(0xa78aff, { emissive: 0x423377, emissiveIntensity: 0.6 }), 'arcane-crystal', [0, 0, 0.12]);
  } else if (kind === 'sun') {
    mesh(group, new THREE.SphereGeometry(0.27, 10, 8), gold, 'temple-sun', [0, 0, 0.13]);
    mesh(group, new THREE.TorusGeometry(0.42, 0.045, 5, 16), gold, 'temple-halo', [0, 0, 0.13]);
  }
}

export function buildSwordhavenHouse(spec, mats, coarse, contentIds, center) {
  const root = new THREE.Group();
  root.name = 'swordhaven-building-' + spec.id;
  const [wx, wz] = worldPoint(spec.x, spec.y, center);
  root.position.set(wx, 0, wz);

  const isTemple = spec.emblem === 'sun';
  const isTavern = spec.emblem === 'mug';
  const isMagic = spec.emblem === 'crystal';
  const isForge = spec.emblem === 'swords';
  const width = isTemple ? 9.0 : 8.1;
  const depth = isTavern ? 8.2 : 7.1;
  const height = isTemple ? 6.3 : isTavern ? 5.7 : 5.25;
  const facadeZ = depth / 2 + 0.10;
  const roof = material(spec.roof, { map: swordhavenSurfaceTexture('roof'), roughness: 0.95 });
  const roofRidgeY = height + 1.8;
  const wallMaterial = isTemple ? mats.stone : mats.plaster;
  const walls = mesh(root, new THREE.BoxGeometry(width, height, depth), wallMaterial,
    'timber-and-stone-walls', [0, height / 2, 0], !coarse);
  walls.userData.chroniclesArchitecture = true;
  mesh(root, new THREE.BoxGeometry(width + 0.55, 0.7, depth + 0.6), mats.stone,
    'stone-foundations', [0, 0.35, 0]);
  // One instanced corner-course mesh per house: masonry reads as dressed
  // stone instead of four perfectly smooth box corners.
  const courses = Math.floor((height - 0.75) / 0.70);
  const quoinGeometry = new THREE.BoxGeometry(0.50, 0.31, 0.51);
  const quoins = new THREE.InstancedMesh(quoinGeometry, mats.stone, courses * 4);
  quoins.name = 'corner-dressed-stone-courses';
  const quoin = new THREE.Object3D();
  const quoinColor = new THREE.Color();
  let courseIndex = 0;
  for (let level = 0; level < courses; level += 1) {
    for (const sideX of [-1, 1]) for (const sideZ of [-1, 1]) {
      quoin.position.set(sideX * (width / 2 - 0.08), 0.92 + level * 0.70, sideZ * (depth / 2 - 0.08));
      quoin.scale.set(0.92 + (level % 3) * 0.055, 1, 1);
      quoin.updateMatrix();
      quoins.setMatrixAt(courseIndex, quoin.matrix);
      quoinColor.setHex([0xb5ab9a, 0xa59d8c, 0xc5bba9][level % 3]);
      quoins.setColorAt(courseIndex, quoinColor);
      courseIndex += 1;
    }
  }
  quoins.instanceMatrix.needsUpdate = true;
  if (quoins.instanceColor) quoins.instanceColor.needsUpdate = true;
  root.add(quoins);
  // A proper triangular gable under each pitched roof, not a flat cube roof.
  const gable = new THREE.Shape();
  gable.moveTo(-width / 2, 0);
  gable.lineTo(width / 2, 0);
  gable.lineTo(0, 1.85);
  gable.closePath();
  for (const face of [-1, 1]) {
    const g = mesh(root, new THREE.ShapeGeometry(gable), wallMaterial,
      'roof-gable-' + face, [0, height - 0.06, face * facadeZ]);
    if (face === -1) g.rotation.y = Math.PI;
  }
  for (const side of [-1, 1]) {
    const slope = mesh(root, new THREE.BoxGeometry(width * 0.59, 0.26, depth + 0.9),
      roof, 'pitched-roof-' + side, [side * width * 0.245, height + 0.79, 0], !coarse);
    slope.rotation.z = -side * 0.48;
    // One instanced draw-call per roof slope instead of individual roof tiles.
    // Thin cross-seams add depth without a dense triangle mesh on phones.
    const bands = new THREE.InstancedMesh(
      new THREE.BoxGeometry(width * 0.55, 0.045, 0.07),
      mats.roofSeams,
      coarse ? 7 : 12,
    );
    bands.name = 'pitched-roof-shingle-seams';
    const band = new THREE.Object3D();
    for (let i = 0; i < bands.count; i += 1) {
      band.position.set(0, 0.16, -(depth + 0.6) / 2 + (i + 0.5) * (depth + 0.6) / bands.count);
      band.updateMatrix();
      bands.setMatrixAt(i, band.matrix);
    }
    bands.instanceMatrix.needsUpdate = true;
    slope.add(bands);
  }
  mesh(root, new THREE.CylinderGeometry(0.14, 0.14, depth + 0.98, 7), mats.timber,
    'ridge-timber', [0, roofRidgeY - 0.13, 0]).rotation.x = Math.PI / 2;
  for (const side of [-1, 1]) {
    const fascia = mesh(root, new THREE.BoxGeometry(0.25, 0.28, depth + 1.1),
      mats.timber, 'roof-edge-fascia', [side * width * 0.49, height + 0.02, 0]);
    fascia.rotation.z = side * 0.16;
  }
  // Repeated timber posts and braces form recognisable half-timbered facades.
  const beamY = [1.02, height - 0.67];
  for (const y of beamY) mesh(root, new THREE.BoxGeometry(width, 0.22, 0.23),
    mats.timber, 'horizontal-facade-beam', [0, y, facadeZ]);
  for (const x of [-width * 0.48, 0, width * 0.48]) {
    mesh(root, new THREE.BoxGeometry(0.22, height, 0.27), mats.timber,
      'vertical-facade-post', [x, height / 2, facadeZ], !coarse);
  }
  for (const side of [-1, 1]) {
    const brace = mesh(root, new THREE.BoxGeometry(0.17, 2.15, 0.23), mats.timber,
      'diagonal-timber-brace', [side * width * 0.34, height - 1.77, facadeZ + 0.06]);
    brace.rotation.z = side * 0.55;
  }
  mesh(root, new THREE.BoxGeometry(1.75, 3.12, 0.16), mats.timber,
    'shop-door', [0, 1.56, facadeZ + 0.16]);
  // A projecting stone entrance frame and arched lintel add real depth.
  for (const side of [-1, 1]) {
    mesh(root, new THREE.BoxGeometry(0.28, 3.27, 0.35), mats.stone,
      'door-recessed-stone-jamb', [side * 0.98, 1.62, facadeZ + 0.28]);
  }
  mesh(root, new THREE.BoxGeometry(2.27, 0.21, 0.43), mats.stone,
    'door-stone-lintel', [0, 3.21, facadeZ + 0.26]);
  // Lanterns and pennants are attached to the blocking building footprint,
  // never freestanding on traversable tiles.
  for (const x of [-width * 0.41, width * 0.41]) {
    mesh(root, new THREE.BoxGeometry(0.14, 0.24, 0.4), mats.steel,
      'shop-lantern-bracket', [x, height - 0.36, facadeZ + 0.19]);
    mesh(root, new THREE.BoxGeometry(0.30, 0.43, 0.28), mats.window,
      'shop-amber-lantern', [x, height - 0.69, facadeZ + 0.26]);
  }
  for (const side of [-1, 1]) {
    const banner = new THREE.Group();
    banner.name = 'shop-pennant-' + (side < 0 ? 'left' : 'right');
    banner.position.set(side * width * 0.38, height - 1.03, facadeZ + 0.19);
    mesh(banner, new THREE.BoxGeometry(0.68, 1.45, 0.045), roof,
      'vertical-heraldic-banner', [0, -0.48, 0]);
    mesh(banner, new THREE.BoxGeometry(0.88, 0.10, 0.10), mats.gold,
      'banner-gold-rail', [0, 0.31, 0.07]);
    root.add(banner);
  }
  mesh(root, new THREE.SphereGeometry(0.08, 8, 6), mats.gold,
    'door-handle', [0.58, 1.45, facadeZ + 0.29]);
  for (const x of [-width * 0.33, width * 0.33]) {
    const front = facadeZ + 0.16;
    mesh(root, new THREE.BoxGeometry(1.37, 1.23, 0.11), mats.window,
      'warm-glass-window', [x, 2.75, front]);
    for (const dx of [-0.70, 0.70]) mesh(root, new THREE.BoxGeometry(0.10, 1.38, 0.18),
      mats.timber, 'window-side-frame', [x + dx, 2.75, front + 0.05]);
    for (const dy of [-0.62, 0, 0.62]) mesh(root, new THREE.BoxGeometry(1.5, 0.10, 0.18),
      mats.timber, 'window-rail', [x, 2.75 + dy, front + 0.05]);
    mesh(root, new THREE.BoxGeometry(1.62, 0.15, 0.43), mats.stone,
      'stone-window-sill', [x, 2.04, front + 0.11]);
    mesh(root, new THREE.BoxGeometry(1.7, 0.36, 0.65), mats.stone,
      'flower-window-box', [x, 1.83, front + 0.34]);
    for (const fx of [-0.49, 0, 0.49]) {
      mesh(root, new THREE.IcosahedronGeometry(0.22, 0), mats.leaves,
        'window-box-leaves', [x + fx, 2.13, front + 0.38]);
      mesh(root, new THREE.IcosahedronGeometry(0.11, 0), mats.flowers,
        'window-box-flowers', [x + fx + 0.03, 2.3, front + 0.42]);
    }
  }
  // The former blank side walls now have inset windows and deep stone sills.
  // All facade details remain within the foundation's authored footprint.
  for (const side of [-1, 1]) {
    for (const z of [-depth * 0.22, depth * 0.22]) {
      const edge = side * (width / 2 + 0.105);
      mesh(root, new THREE.BoxGeometry(0.13, 1.63, 1.77), mats.stone,
        'side-window-stone-reveal', [edge, 2.79, z]);
      mesh(root, new THREE.BoxGeometry(0.16, 1.27, 1.39), mats.window,
        'side-window-amber-glass', [edge + side * 0.09, 2.84, z]);
      mesh(root, new THREE.BoxGeometry(0.26, 0.16, 1.88), mats.stone,
        'side-window-carved-sill', [edge + side * 0.11, 1.95, z]);
      mesh(root, new THREE.BoxGeometry(0.15, 0.10, 1.4), mats.timber,
        'side-window-crossbar', [edge + side * 0.17, 2.85, z]);
    }
  }
  // Shaped dormers break the broad low-poly roof silhouette. One on touch,
  // two on desktop; all parts are decorative and far above the walk grid.
  for (const side of (coarse ? [-1] : [-1, 1])) {
    const x = side * width * 0.245;
    const z = depth * 0.17;
    const bay = new THREE.Group();
    bay.name = 'pitched-roof-dormer-' + side;
    bay.position.set(x, height + 1.38, z);
    mesh(bay, new THREE.BoxGeometry(1.22, 1.16, 1.10), wallMaterial,
      'dormer-walls', [0, 0, 0]);
    mesh(bay, new THREE.BoxGeometry(0.73, 0.69, 0.11), mats.window,
      'dormer-glass', [0, 0.09, 0.61]);
    for (const rx of [-1, 1]) {
      const canopy = mesh(bay, new THREE.BoxGeometry(0.87, 0.14, 1.47), roof,
        'dormer-roof-slope', [rx * 0.30, 0.76, 0]);
      canopy.rotation.z = -rx * 0.48;
    }
    root.add(bay);
  }
  mesh(root, new THREE.BoxGeometry(1.05, 2.3, 0.95), mats.stone,
    'stone-chimney', [width * 0.31, height + 1.04, -depth * 0.25], !coarse);
  mesh(root, new THREE.BoxGeometry(1.38, 0.22, 1.32), mats.stone,
    'chimney-cap', [width * 0.31, height + 2.24, -depth * 0.25]);

  // Each hero building has a distinctive readable silhouette.
  if (isTemple) {
    mesh(root, new THREE.CylinderGeometry(1.19, 1.38, 3.2, coarse ? 12 : 20), mats.stone,
      'temple-bell-tower', [0, height + 2.5, -depth * 0.11], !coarse);
    mesh(root, new THREE.ConeGeometry(1.48, 2.8, coarse ? 12 : 20), roof,
      'temple-spire', [0, height + 5.5, -depth * 0.11], !coarse);
    mesh(root, new THREE.TorusGeometry(0.49, 0.10, 8, 20), mats.gold,
      'temple-rose-window', [0, height - 0.56, facadeZ + 0.14]);
  } else if (isMagic) {
    mesh(root, new THREE.CylinderGeometry(1.11, 1.20, 3.35, coarse ? 12 : 20), mats.plaster,
      'magic-shop-turret', [-width * 0.40, height + 1.62, -depth * 0.28], !coarse);
    mesh(root, new THREE.ConeGeometry(1.52, 3.5, coarse ? 12 : 20), roof,
      'magic-turret-roof', [-width * 0.40, height + 5.02, -depth * 0.28], !coarse);
    mesh(root, new THREE.OctahedronGeometry(0.42, 0), mats.arcane,
      'arcane-window-lantern', [width * 0.33, height - 0.3, facadeZ + 0.28]);
  } else if (isTavern) {
    mesh(root, new THREE.BoxGeometry(5.1, 0.21, 2.05), roof,
      'tavern-porch-awning', [0, 3.35, facadeZ + 1.07], !coarse);
    for (const x of [-2.35, 2.35]) mesh(root, new THREE.CylinderGeometry(0.11, 0.14, 3.15, 8),
      mats.timber, 'porch-timber-support', [x, 1.63, facadeZ + 1.60], !coarse);
  } else if (isForge) {
    mesh(root, new THREE.CylinderGeometry(0.52, 0.59, 1.3, 10), mats.stone,
      'forge-brazier', [-width * 0.40, 0.65, facadeZ + 0.23]);
    mesh(root, new THREE.SphereGeometry(0.32, 9, 8), mats.embers,
      'forge-brazier-embers', [-width * 0.40, 1.42, facadeZ + 0.23]);
  } else {
    for (const x of [-width * 0.35, width * 0.35]) mesh(root,
      new THREE.BoxGeometry(0.67, 1.48, 0.22), mats.steel,
      'armor-display', [x, 1.12, facadeZ + 0.24]);
  }
  const sign = new THREE.Group();
  sign.name = 'swordhaven-interaction-' + spec.id;
  sign.userData.chroniclesContentId = spec.id;
  sign.position.set(0, height - 0.33, facadeZ + 0.44);
  mesh(sign, new THREE.BoxGeometry(1.8, 1.4, 0.16), mats.timber, 'hanging-sign', [0, 0, 0]);
  mesh(sign, new THREE.BoxGeometry(1.66, 1.26, 0.08), mats.stone, 'sign-inset', [0, 0, 0.1]);
  emblem(sign, spec.emblem, mats);
  root.add(sign);
  return { root, sign, interactive: contentIds.has(spec.id) };
}

export function buildSwordhavenTree(root, x, z, mats, coarse, index) {
  const treeRoot = new THREE.Group();
  treeRoot.name = 'swordhaven-tree-' + index;
  treeRoot.position.set(x, 0, z);
  mesh(treeRoot, new THREE.CylinderGeometry(0.20, 0.32, 2.8, 8), mats.timber,
    'tree-trunk', [0, 1.4, 0], !coarse);
  const canopy = material(index % 3 === 0 ? 0x648a48 : index % 3 === 1 ? 0x477849 : 0x7a9c52);
  const geometry = new THREE.IcosahedronGeometry(1.12, coarse ? 0 : 1);
  const foliage = new THREE.InstancedMesh(geometry, canopy, coarse ? 4 : 6);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < foliage.count; i += 1) {
    const angle = i * Math.PI * 2 / foliage.count + index * 0.27;
    dummy.position.set(Math.cos(angle) * 0.85, 3.48 + (i % 3) * 0.25, Math.sin(angle) * 0.8);
    dummy.scale.set(1.14 + (i % 2) * 0.15, 1.12, 1.03 + (i % 3) * 0.08);
    dummy.updateMatrix();
    foliage.setMatrixAt(i, dummy.matrix);
  }
  foliage.name = 'leaf-canopy-cluster';
  foliage.castShadow = !coarse;
  treeRoot.add(foliage);
  root.add(treeRoot);
}

function laySwordhavenCobblestones(root, mats, coarse, width, height) {
  // Deterministic paving: one instanced draw call rather than hundreds of meshes.
  // Thin pavers are visual only; the manifest grid remains collision authority.
  const positions = [];
  const span = Math.min(height * CELL * 0.38, 30);
  const cross = Math.min(width * CELL * 0.35, 26);
  for (let z = -span; z <= span; z += coarse ? 1.16 : 0.87) {
    for (let x = -3.03; x <= 3.03; x += coarse ? 1.22 : 0.82) {
      positions.push([x + (Math.round(z) % 2 ? 0.18 : 0), z]);
    }
  }
  for (let x = -cross; x <= cross; x += coarse ? 1.16 : 0.88) {
    for (let z = -2.85; z <= 2.85; z += coarse ? 1.22 : 0.84) {
      if (Math.abs(x) > 3.65 || Math.abs(z) > 3.65) positions.push([x, z]);
    }
  }
  const paver = new THREE.InstancedMesh(
    new THREE.BoxGeometry(coarse ? 1.05 : 0.76, 0.065, coarse ? 1.0 : 0.75),
    mats.paving, positions.length,
  );
  paver.name = 'swordhaven-street-cobblestones';
  paver.receiveShadow = true;
  const dummy = new THREE.Object3D();
  const tone = new THREE.Color();
  positions.forEach(([x, z], i) => {
    const seed = ((i * 19 + Math.round(x * 7) + Math.round(z * 13)) >>> 0) % 9;
    dummy.position.set(x, 0.055 + (seed % 3) * 0.002, z);
    dummy.rotation.y = (seed % 3 - 1) * 0.025;
    dummy.updateMatrix();
    paver.setMatrixAt(i, dummy.matrix);
    tone.setHex([0xaaa293, 0x9b9284, 0xb1a99a, 0x8e887d, 0xbab09a][seed % 5]);
    paver.setColorAt(i, tone);
  });
  paver.instanceMatrix.needsUpdate = true;
  if (paver.instanceColor) paver.instanceColor.needsUpdate = true;
  root.add(paver);
}


function dressSwordhavenRoadsides(root, mats, coarse, width, height, center) {
  // Road shoulders are visual trim, not new blockers. A single instanced
  // cobble mesh is substantially cheaper than individual edge stones.
  const shoulders = [];
  const mainSpan = Math.min(height * CELL * 0.38, 30);
  const crossSpan = Math.min(width * CELL * 0.35, 26);
  const step = coarse ? 0.96 : 0.82;
  for (let z = -mainSpan; z <= mainSpan; z += step) {
    if (Math.abs(z) < 10.8) continue; // The circular plaza owns this area.
    for (const side of [-1, 1]) shoulders.push([side * 3.45, z]);
  }
  for (let x = -crossSpan; x <= crossSpan; x += step) {
    if (Math.abs(x) < 11.2) continue;
    for (const side of [-1, 1]) shoulders.push([x, side * 3.43]);
  }
  const edges = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.25, 0.065, 0.72), mats.paving, shoulders.length,
  );
  edges.name = 'swordhaven-roadside-stone-edging';
  edges.receiveShadow = true;
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  shoulders.forEach(([x, z], i) => {
    dummy.position.set(x, 0.067, z);
    dummy.rotation.y = ((i % 7) - 3) * 0.018;
    dummy.scale.set(0.94 + (i % 5) * 0.02, 1, 0.92 + (i % 3) * 0.025);
    dummy.updateMatrix();
    edges.setMatrixAt(i, dummy.matrix);
    color.setHex([0x8b867c, 0xa29b8b, 0xc0b7a1, 0x9c947e][i % 4]);
    edges.setColorAt(i, color);
  });
  edges.instanceMatrix.needsUpdate = true;
  if (edges.instanceColor) edges.instanceColor.needsUpdate = true;
  root.add(edges);

  // Six slim, wind-bent leaves per tuft. Narrow silhouettes avoid the large
  // triangular spikes of the initial pass, while staying one draw call.
  const bladeVertices = [];
  for (let blade = 0; blade < 6; blade += 1) {
    const angle = blade * Math.PI / 3;
    const ux = Math.cos(angle);
    const uz = Math.sin(angle);
    const offset = blade % 2 === 0 ? 0.015 : 0.044;
    const height = 0.12 + (blade % 3) * 0.016;
    const spread = 0.024;
    bladeVertices.push(
      ux * offset - uz * spread, 0, uz * offset + ux * spread,
      ux * (offset + 0.08), height, uz * (offset + 0.08),
      ux * offset + uz * spread, 0, uz * offset - ux * spread,
    );
  }
  const tuftGeometry = new THREE.BufferGeometry();
  tuftGeometry.setAttribute('position', new THREE.Float32BufferAttribute(bladeVertices, 3));
  tuftGeometry.computeVertexNormals();
  const candidateCount = coarse ? 560 : 860;
  const positions = [];
  let seed = 0x51a7b3d;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  // Loose clusters instead of solitary evenly scattered triangles. Each patch
  // is repeatable and the original street/building exclusion is still applied.
  let patchX = 0;
  let patchZ = 0;
  for (let i = 0; i < candidateCount; i += 1) {
    if (i % 5 === 0) {
      patchX = (random() - 0.5) * (width * CELL - 7);
      patchZ = (random() - 0.5) * (height * CELL - 7);
    }
    const x = patchX + (random() - 0.5) * 3.1;
    const z = patchZ + (random() - 0.5) * 3.1;
    if (Math.abs(x) >= width * CELL / 2 - 1.5 || Math.abs(z) >= height * CELL / 2 - 1.5) continue;
    if (Math.abs(x) < 5 || Math.abs(z) < 5 || Math.hypot(x, z) < 11.6) continue;
    // Keep plants away from walls, shop foundations and obstructing trunks.
    if (SWORDHAVEN_BUILDINGS.some(spec => {
      const [bx, bz] = worldPoint(spec.x, spec.y, center);
      return Math.abs(x - bx) < 5.2 && Math.abs(z - bz) < 5.2;
    })) continue;
    positions.push([x, z, random(), random()]);
  }
  const meadow = new THREE.InstancedMesh(
    tuftGeometry, material(0xffffff, { side: THREE.DoubleSide, roughness: 1 }),
    positions.length,
  );
  meadow.name = 'swordhaven-low-meadow-tufts';
  meadow.receiveShadow = false;
  positions.forEach(([x, z, rotation, growth], i) => {
    dummy.position.set(x, -0.048, z);
    dummy.rotation.set(0, rotation * Math.PI * 2, 0);
    dummy.scale.setScalar(0.66 + growth * 0.34);
    dummy.updateMatrix();
    meadow.setMatrixAt(i, dummy.matrix);
    color.setHex([0x799153, 0x869a65, 0x96a273, 0x708957][i % 4]);
    meadow.setColorAt(i, color);
  });
  meadow.instanceMatrix.needsUpdate = true;
  if (meadow.instanceColor) meadow.instanceColor.needsUpdate = true;
  root.add(meadow);
}

// Shared village palette: the legacy square and the First Book town use the
// same dressed stone, stucco, timber and roof textures.
export function createSwordhavenMaterials() {
  return {
    grass: material(0xffffff, { map: swordhavenGrassTexture(), roughness: 0.98 }), cobble: material(0x9d9588),
    stone: material(0xafa597, { map: swordhavenSurfaceTexture('masonry'), roughness: 0.95 }),
    plaster: material(0xe0caac, { map: swordhavenSurfaceTexture('stucco'), roughness: 0.97 }),
    timber: material(0x694b34, { map: swordhavenSurfaceTexture('timber'), roughness: 0.85 }),
    gold: material(0xd6ae67, { metalness: 0.48 }),
    window: material(0xf8b96e, { emissive: 0x925124, emissiveIntensity: 0.45 }),
    leaves: material(0x64864c), flowers: material(0xc7756c),
    arcane: material(0x9576db, { emissive: 0x403b99, emissiveIntensity: 1.1 }),
    embers: material(0xffa754, { emissive: 0xeb6a20, emissiveIntensity: 1.2 }),
    steel: material(0x80909a, { metalness: 0.6, roughness: 0.32 }),
    paving: material(0xffffff, { roughness: 0.96 }),
    roofSeams: material(0x413a36, { roughness: 0.92 }),
  };
}

export function addSwordhavenClouds(root, coarsePointer = false) {
  // Cloud banks are genuine low-detail 3D volume silhouettes, not a flat sky texture.
  // Basic materials keep the clouds bright without costly per-cloud lighting.
  const cloudMaterial = new THREE.MeshBasicMaterial({
    color: 0xf6f8f4, transparent: true, opacity: 0.87, depthWrite: false,
  });
  for (let cluster = 0; cluster < (coarsePointer ? 3 : 5); cluster += 1) {
    const cloud = new THREE.Group();
    cloud.name = 'swordhaven-cloud-' + cluster;
    const direction = cluster % 2 === 0 ? -1 : 1;
    cloud.position.set(direction * (16 + cluster * 2.7), 16 + (cluster % 3) * 2, -38 + cluster * 3);
    for (let puff = 0; puff < 3; puff += 1) {
      mesh(cloud, new THREE.SphereGeometry(2.35 - puff * 0.26, 9, 6),
        cloudMaterial, 'cloud-puff', [(puff - 1) * 2.0, puff % 2 ? 0.65 : 0, 0]);
    }
    root.add(cloud);
  }
}

export function buildSwordhavenScene(scene, { scenePlan = {}, coarsePointer = false } = {}) {
  const center = scenePlan.center || { x: 9, y: 9 };
  const width = Math.max(19, Number(scenePlan.width) || 19);
  const height = Math.max(19, Number(scenePlan.height) || 19);
  scene.background = new THREE.Color(0xb8dce9); // Fallback if WebGL cannot render the dome.
  scene.fog = new THREE.Fog(0xb8dce9, 48, Math.max(width, height) * CELL * 0.98);
  const sunDirection = new THREE.Vector3(-28, 26, -90).normalize();
  scene.add(createSwordhavenSkyDome(sunDirection));
  const skylight = new THREE.HemisphereLight(0xd7ebff, 0x688258, 1.45);
  scene.add(skylight);
  const sun = new THREE.DirectionalLight(0xffedd1, coarsePointer ? 1.2 : 1.65);
  sun.name = 'swordhaven-sun';
  sun.position.copy(sunDirection).multiplyScalar(98);
  sun.castShadow = !coarsePointer;
  if (!coarsePointer) {
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -45; sun.shadow.camera.right = 45;
    sun.shadow.camera.top = 45; sun.shadow.camera.bottom = -45;
    sun.shadow.bias = -0.001;
  }
  scene.add(sun);

  const root = new THREE.Group();
  root.name = 'chronicles-swordhaven-town';
  scene.add(root);
  const mats = createSwordhavenMaterials();
  mesh(root, new THREE.BoxGeometry(width * CELL, 0.3, height * CELL),
    mats.grass, 'grass-terrain', [0, -0.2, 0]);
  mesh(root, new THREE.BoxGeometry(7.1, 0.08, height * CELL * 0.8),
    mats.cobble, 'main-street', [0, -0.03, 0]);
  mesh(root, new THREE.BoxGeometry(width * CELL * 0.75, 0.08, 6.9),
    mats.cobble, 'market-cross-street', [0, -0.028, 0]);
  mesh(root, new THREE.CylinderGeometry(10.2, 10.2, 0.11, 24),
    mats.cobble, 'circular-town-square', [0, -0.015, 0]);
  laySwordhavenCobblestones(root, mats, coarsePointer, width, height);
  dressSwordhavenRoadsides(root, mats, coarsePointer, width, height, center);
  const fountain = new THREE.Group();
  fountain.name = 'swordhaven-fountain';
  // The full basin must fit the single blocked 4×4 m fountain cell.
  mesh(fountain, new THREE.CylinderGeometry(1.72, 1.88, 0.7, 16),
    mats.stone, 'fountain-basin', [0, 0.34, 0]);
  mesh(fountain, new THREE.CylinderGeometry(1.47, 1.47, 0.03, 16),
    material(0x64bfd0, { metalness: 0.12, roughness: 0.22 }), 'fountain-water', [0, 0.71, 0]);
  const rim = mesh(fountain, new THREE.TorusGeometry(1.74, 0.10, 6, 24),
    mats.stone, 'fountain-carved-rim', [0, 0.75, 0]);
  rim.rotation.x = Math.PI / 2;
  mesh(fountain, new THREE.CylinderGeometry(0.31, 0.44, 1.9, 10),
    mats.stone, 'fountain-pedestal', [0, 1.25, 0]);
  root.add(fountain);

  addSwordhavenClouds(root, coarsePointer);

  // Low walls define the silhouette but never replace grid-authoritative collision.
  for (const sign of [-1, 1]) {
    mesh(root, new THREE.BoxGeometry(0.6, 1.55, 24), mats.stone,
      'perimeter-stone-wall-' + sign, [sign * (width * CELL / 2 - 1.4), 0.78, 0]);
    mesh(root, new THREE.BoxGeometry(19, 1.0, 0.6), mats.stone,
      'garden-boundary-' + sign, [sign * 24, 0.5, -height * CELL / 2 + 5.0]);
  }
  // Flowers live in each shop's authored footprint, never in walkable streets.

  const authoredContent = new Set((scenePlan.content || []).filter(e => e.visible !== false).map(e => e.id));
  const contentProps = [];
  SWORDHAVEN_BUILDINGS.forEach(spec => {
    const result = buildSwordhavenHouse(spec, mats, coarsePointer, authoredContent, center);
    root.add(result.root);
    if (result.interactive) contentProps.push({
      id: spec.id, kind: 'lore', root: result.sign, phase: 0,
    });
  });
  const locations = [[1,1],[17,1],[1,17],[17,17],[3,9],[15,9],[7,16],[12,16]];
  locations.forEach(([x, y], i) => {
    const [wx, wz] = worldPoint(x, y, center);
    buildSwordhavenTree(root, wx, wz, mats, coarsePointer, i);
  });
  // An authored gate exit participates in the same raycast and content rules as dungeon exits.
  (scenePlan.content || []).filter(entry => entry.kind === 'exit' && entry.position).forEach(entry => {
    const [x, z] = worldPoint(entry.position.x, entry.position.y, center);
    const gate = new THREE.Group();
    gate.name = 'swordhaven-exit-' + entry.id;
    gate.userData.chroniclesContentId = entry.id;
    gate.position.set(x, 0, z);
    mesh(gate, new THREE.BoxGeometry(0.5, 5.1, 0.8), mats.stone, 'gate-left-post', [-1.8, 2.55, 0]);
    mesh(gate, new THREE.BoxGeometry(0.5, 5.1, 0.8), mats.stone, 'gate-right-post', [1.8, 2.55, 0]);
    mesh(gate, new THREE.BoxGeometry(4.2, 0.65, 1), mats.timber, 'gate-lintel', [0, 5.15, 0]);
    root.add(gate);
    contentProps.push({ id: entry.id, kind: 'exit', root: gate, phase: 0 });
  });

  return {
    enemies: {}, enemyDefinitions: [],
    spectralChapel: new THREE.Group(),
    sigilMaterial: material(0x8c785a, { emissive: 0x241300 }),
    gateMaterial: material(0x766350, { emissive: 0x120700 }),
    gateRunes: [], torches: [], contentProps, sceneCenter: center, materialArt: null,
  };
}
