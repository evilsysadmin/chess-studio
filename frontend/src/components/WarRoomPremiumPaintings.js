import * as THREE from 'three';

function physical(color, options = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: options.metalness ?? 0,
    roughness: options.roughness ?? 0.72,
    clearcoat: options.clearcoat ?? 0.08,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.42,
    specularIntensity: options.specularIntensity ?? 0.24,
    map: options.map ?? null,
  });
}

function addBox(group, size, material, position, name = '') {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (name) mesh.name = name;
  group.add(mesh);
  return mesh;
}

function seededNoise(x, y, seed) {
  const value = Math.sin((x * 12.9898 + y * 78.233 + seed * 37.719) * 0.91) * 43758.5453;
  return value - Math.floor(value);
}

function createPainterlyTexture(seed, warm = false) {
  const width = 96;
  const height = 64;
  const data = new Uint8Array(width * height * 4);
  const skyA = warm ? [96, 91, 82] : [78, 91, 100];
  const skyB = warm ? [161, 137, 105] : [130, 139, 141];
  const earthA = warm ? [78, 64, 48] : [58, 66, 59];
  const earthB = warm ? [121, 92, 62] : [81, 91, 72];

  for (let y = 0; y < height; y += 1) {
    const horizon = 0.53 + (seed % 3) * 0.025;
    const v = y / (height - 1);
    for (let x = 0; x < width; x += 1) {
      const u = x / (width - 1);
      const noise = seededNoise(x, y, seed);
      const broad = seededNoise(Math.floor(x / 7), Math.floor(y / 5), seed + 11);
      const below = v > horizon + Math.sin(u * Math.PI * (2.2 + seed * 0.09)) * 0.045;
      const baseA = below ? earthA : skyA;
      const baseB = below ? earthB : skyB;
      const blend = Math.min(1, Math.max(0, (below ? v - horizon : v) * 0.82 + broad * 0.32));
      const index = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const painted = baseA[channel] * (1 - blend) + baseB[channel] * blend;
        data[index + channel] = Math.max(0, Math.min(255, painted + (noise - 0.5) * 18));
      }
      data[index + 3] = 255;
    }
  }

  // Add a soft distant castle silhouette directly into the pixel field. It
  // reads as painted detail at tactical distance rather than polygon scenery.
  const castleX = warm ? 59 : 34;
  const castleY = 29;
  const castleW = 18;
  const castleH = 13;
  for (let y = castleY; y < castleY + castleH; y += 1) {
    for (let x = castleX; x < castleX + castleW; x += 1) {
      const localX = x - castleX;
      const crenel = y < castleY + 3 && (localX % 5 === 1 || localX % 5 === 2);
      const body = y >= castleY + 3;
      if (!crenel && !body) continue;
      const index = (y * width + x) * 4;
      const shade = 126 + Math.floor(seededNoise(x, y, seed + 23) * 28);
      data[index] = shade;
      data[index + 1] = shade - 7;
      data[index + 2] = shade - 16;
    }
  }

  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.name = warm ? 'war-room-painting-texture-warm' : 'war-room-painting-texture-cool';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  texture.userData.warRoomPainterly = true;
  texture.userData.resolution = [width, height];
  return texture;
}

function addPainting(group, x, y, z, towardBoard, warm, index) {
  const frameDark = physical(0x4a2e1d, {
    metalness: 0.05,
    roughness: 0.46,
    clearcoat: 0.3,
    clearcoatRoughness: 0.3,
    specularIntensity: 0.38,
  });
  const gilding = physical(0xb68a43, {
    metalness: 0.74,
    roughness: 0.28,
    clearcoat: 0.38,
    clearcoatRoughness: 0.24,
    specularIntensity: 0.58,
  });
  const linen = physical(0xffffff, {
    roughness: 0.78,
    clearcoat: 0.025,
    clearcoatRoughness: 0.86,
    specularIntensity: 0.14,
    map: createPainterlyTexture(17 + index * 13, warm),
  });

  const frame = new THREE.Group();
  frame.name = `war-room-premium-painting-${index}`;
  frame.userData.warRoomPaintingFinish = 'painterly-canvas-v1';
  frame.position.set(x, y, z);

  addBox(frame, [2.32, 1.72, 0.065], frameDark, [0, 0, 0], 'war-room-premium-frame-back');
  addBox(frame, [2.12, 1.52, 0.035], gilding, [0, 0, towardBoard * 0.057], 'war-room-premium-frame-gilt-bed');
  addBox(frame, [1.94, 1.34, 0.028], linen, [0, 0, towardBoard * 0.086], 'war-room-premium-painting-canvas');

  const outerBars = [
    [0, 0.795, 2.28, 0.075], [0, -0.795, 2.28, 0.075],
    [-1.105, 0, 0.075, 1.6], [1.105, 0, 0.075, 1.6],
  ];
  for (const [dx, dy, sx, sy] of outerBars) {
    addBox(frame, [sx, sy, 0.045], gilding, [dx, dy, towardBoard * 0.094]);
  }

  const innerBars = [
    [0, 0.69, 2.02, 0.032], [0, -0.69, 2.02, 0.032],
    [-0.985, 0, 0.032, 1.38], [0.985, 0, 0.032, 1.38],
  ];
  for (const [dx, dy, sx, sy] of innerBars) {
    const trim = addBox(frame, [sx, sy, 0.028], gilding, [dx, dy, towardBoard * 0.11]);
    trim.castShadow = false;
  }

  group.add(frame);
  return frame;
}

export function addPremiumWarRoomPaintings(group, { wallZ, towardBoard, coarsePointer = false } = {}) {
  if (coarsePointer || !group || !Number.isFinite(wallZ) || !Number.isFinite(towardBoard)) return 0;
  const paintingZ = wallZ + towardBoard * 0.72;
  addPainting(group, -4.95, 3.65, paintingZ, towardBoard, false, 0);
  addPainting(group, 4.95, 3.66, paintingZ, towardBoard, true, 1);
  group.userData.warRoomPremiumPaintings = 2;
  return 2;
}
