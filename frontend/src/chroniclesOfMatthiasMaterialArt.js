import * as THREE from 'three';

const ROOT_NAME = 'chronicles-tactics-premium-materials';

export const CHRONICLES_TACTICS_MATERIAL_STYLE = Object.freeze({
  desktopTextureSize: 192,
  coarseTextureSize: 64,
  floorRepeat: 2.55,
  wallRepeat: 1.25,
  floorNormalStrength: 0.3,
  wallNormalStrength: 0.36,
  minRoughness: 0.7,
  maxRoughness: 0.97,
});

function fract(value) {
  return value - Math.floor(value);
}

function noise(x, y, seed) {
  return fract(Math.sin((x + seed * 0.71) * 12.9898 + (y - seed * 1.17) * 78.233) * 43758.5453);
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function masonryGroove(x, y, size, role) {
  if (role !== 'wall') return 0;
  const courseHeight = size / 4;
  const brickWidth = size / 2;
  const joint = Math.max(1, size / 96);
  const row = Math.floor(y / courseHeight);
  const rowY = y - row * courseHeight;
  const stagger = row % 2 ? brickWidth / 2 : 0;
  const brickX = (x + stagger) % brickWidth;
  const horizontalJoint = Math.min(rowY, courseHeight - rowY) < joint;
  const verticalJoint = Math.min(brickX, brickWidth - brickX) < joint;
  if (horizontalJoint) return -0.34;
  if (verticalJoint) return -0.28;
  return 0;
}

function masonryBlockTone(x, y, size, seed, role) {
  if (role !== 'wall') return 0;
  const courseHeight = size / 4;
  const brickWidth = size / 2;
  const row = Math.floor(y / courseHeight);
  const stagger = row % 2 ? brickWidth / 2 : 0;
  const column = Math.floor(((x + stagger) % size) / brickWidth);
  return (noise(column, row, seed + 131) - 0.5) * 14;
}

function heightField(size, seed) {
  const field = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const broad = noise(Math.floor(x / 14), Math.floor(y / 14), seed);
      const medium = noise(Math.floor(x / 4), Math.floor(y / 4), seed + 11);
      const fine = noise(x, y, seed + 29);
      const vein = Math.abs(Math.sin(x * 0.105 + y * 0.071 + seed * 0.83));
      const crack = vein > 0.987 && fine > 0.48 ? -0.28 : 0;
      field[y * size + x] = broad * 0.34 + medium * 0.26 + fine * 0.12 + crack;
    }
  }
  return field;
}

function textureFromData(data, size, name, { colorSpace = THREE.NoColorSpace, repeat = 1 } = {}) {
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.name = name;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = colorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createStoneTextureSet({ size, seed, repeat, normalStrength, role }) {
  const heights = heightField(size, seed);
  const colorData = new Uint8Array(size * size * 4);
  const roughnessData = new Uint8Array(size * size * 4);
  const normalData = new Uint8Array(size * size * 4);

  const at = (x, y) => {
    const wrappedX = (x + size) % size;
    const wrappedY = (y + size) % size;
    return heights[wrappedY * size + wrappedX]
      + masonryGroove(wrappedX, wrappedY, size, role);
  };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const height = at(x, y);
      const fine = noise(x, y, seed + 53);
      const mineral = noise(Math.floor(x / 7), Math.floor(y / 7), seed + 71);
      const strata = Math.sin((y + seed * 3.7) * 0.11 + Math.sin(x * 0.045) * 1.8);
      const fissure = Math.max(0, 0.21 - height) * 34;
      const broadStain = noise(Math.floor(x / 18), Math.floor(y / 18), seed + 101);
      const shade = 214 + height * 32 + (fine - 0.5) * 11 + strata * 4 - fissure;

      const warmBias = role === 'floor' ? 5 : 1;
      const coolBias = role === 'wall' ? 5 : 2;
      const stain = (broadStain - 0.5) * 10;
      const blockTone = masonryBlockTone(x, y, size, seed, role);
      colorData[index] = clampByte(shade + mineral * 7 + warmBias + stain + blockTone);
      colorData[index + 1] = clampByte(shade + mineral * 3 + stain * 0.55 + blockTone * 0.72);
      colorData[index + 2] = clampByte(shade - mineral * 4 + coolBias - stain * 0.3 + blockTone * 0.45);
      colorData[index + 3] = 255;

      const roughness = 196 + (1 - Math.max(-0.2, Math.min(0.8, height))) * 34 + fine * 15 + Math.abs(strata) * 5;
      const roughnessByte = clampByte(roughness);
      roughnessData[index] = roughnessByte;
      roughnessData[index + 1] = roughnessByte;
      roughnessData[index + 2] = roughnessByte;
      roughnessData[index + 3] = 255;

      const dx = (at(x + 1, y) - at(x - 1, y)) * normalStrength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * normalStrength;
      const invLength = 1 / Math.max(0.0001, Math.hypot(dx, dy, 1));
      normalData[index] = clampByte(((-dx * invLength) * 0.5 + 0.5) * 255);
      normalData[index + 1] = clampByte(((-dy * invLength) * 0.5 + 0.5) * 255);
      normalData[index + 2] = clampByte(((1 * invLength) * 0.5 + 0.5) * 255);
      normalData[index + 3] = 255;
    }
  }

  return {
    color: textureFromData(colorData, size, `chronicles-stone-color-${seed}`, {
      colorSpace: THREE.SRGBColorSpace,
      repeat,
    }),
    roughness: textureFromData(roughnessData, size, `chronicles-stone-roughness-${seed}`, { repeat }),
    normal: textureFromData(normalData, size, `chronicles-stone-normal-${seed}`, { repeat }),
  };
}

function hasAncestorPrefix(node, prefix) {
  let current = node;
  while (current) {
    if (String(current.name || '').startsWith(prefix)) return true;
    current = current.parent;
  }
  return false;
}

export function chroniclesTacticsMaterialRole(node) {
  const name = String(node?.name || '');
  if (name.startsWith('chronicles-iso-floor-') || name === 'chronicles-iso-foundation') return 'floor';
  if (name.startsWith('chronicles-iso-wall-')) return 'wall';
  if (hasAncestorPrefix(node, 'chronicles-iso-column-')) return 'wall';
  if (hasAncestorPrefix(node, 'chronicles-iso-far-shrine')) return 'wall';
  return null;
}

function applyTextureSet(material, set, normalStrength) {
  if (!material?.isMeshStandardMaterial) return null;
  const prior = {
    map: material.map,
    roughnessMap: material.roughnessMap,
    normalMap: material.normalMap,
    normalScale: material.normalScale?.clone?.() || null,
    roughness: material.roughness,
  };

  material.map = set.color;
  material.roughnessMap = set.roughness;
  material.normalMap = set.normal;
  material.normalScale = new THREE.Vector2(normalStrength, normalStrength);
  material.roughness = Math.min(
    CHRONICLES_TACTICS_MATERIAL_STYLE.maxRoughness,
    Math.max(CHRONICLES_TACTICS_MATERIAL_STYLE.minRoughness, Number(material.roughness ?? 0.85)),
  );
  material.needsUpdate = true;

  return () => {
    material.map = prior.map;
    material.roughnessMap = prior.roughnessMap;
    material.normalMap = prior.normalMap;
    if (prior.normalScale) material.normalScale.copy(prior.normalScale);
    material.roughness = prior.roughness;
    material.needsUpdate = true;
  };
}

export function installChroniclesTacticsPremiumMaterials(scene, { coarsePointer = false } = {}) {
  if (!scene?.add || !scene?.traverse) return null;
  const existing = scene.getObjectByName?.(ROOT_NAME);
  if (existing) return existing;

  const size = coarsePointer
    ? CHRONICLES_TACTICS_MATERIAL_STYLE.coarseTextureSize
    : CHRONICLES_TACTICS_MATERIAL_STYLE.desktopTextureSize;
  const floorSet = createStoneTextureSet({
    size,
    seed: 23,
    repeat: CHRONICLES_TACTICS_MATERIAL_STYLE.floorRepeat,
    normalStrength: CHRONICLES_TACTICS_MATERIAL_STYLE.floorNormalStrength,
    role: 'floor',
  });
  const wallSet = createStoneTextureSet({
    size,
    seed: 47,
    repeat: CHRONICLES_TACTICS_MATERIAL_STYLE.wallRepeat,
    normalStrength: CHRONICLES_TACTICS_MATERIAL_STYLE.wallNormalStrength,
    role: 'wall',
  });

  const root = new THREE.Group();
  root.name = ROOT_NAME;
  const restores = [];
  const visited = new Set();

  scene.traverse((node) => {
    if (!node?.isMesh) return;
    const role = chroniclesTacticsMaterialRole(node);
    if (!role) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.filter(Boolean).forEach((material) => {
      const key = `${role}:${material.uuid}`;
      if (visited.has(key)) return;
      visited.add(key);
      const set = role === 'floor' ? floorSet : wallSet;
      const strength = role === 'floor'
        ? CHRONICLES_TACTICS_MATERIAL_STYLE.floorNormalStrength
        : CHRONICLES_TACTICS_MATERIAL_STYLE.wallNormalStrength;
      const restore = applyTextureSet(material, set, strength);
      if (restore) restores.push(restore);
    });
  });

  root.userData.chroniclesArtCancel = () => {
    restores.splice(0).reverse().forEach((restore) => restore());
    [floorSet, wallSet].forEach((set) => {
      set.color.dispose();
      set.roughness.dispose();
      set.normal.dispose();
    });
  };
  root.userData.chroniclesMaterialFinish = 'procedural-pbr-stone-v3';
  root.userData.chroniclesMasonryProfile = 'staggered-courses-v1';
  root.userData.chroniclesMaterialCount = visited.size;
  scene.add(root);
  return root;
}
