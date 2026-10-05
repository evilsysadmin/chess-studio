import * as THREE from 'three';
import {
  chroniclesMaterialPlanForScene,
  chroniclesMaterialProfile,
} from './chronicles/chroniclesMaterialAtlas.js';

const ROOT_NAME = 'chronicles-tactics-premium-materials';

export const CHRONICLES_TACTICS_MATERIAL_STYLE = Object.freeze({
  desktopTextureSize: 192,
  coarseTextureSize: 64,
  floorRepeat: 2.55,
  wallRepeat: 1.25,
  floorNormalStrength: 0.52,
  wallNormalStrength: 0.88,
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

function patternDimensions(size, pattern) {
  if (pattern === 'brick' || pattern === 'ruined') {
    return { courseHeight: size / 7, blockWidth: size / 3 };
  }
  if (pattern === 'ashlar') {
    return { courseHeight: size / 4, blockWidth: size / 1.65 };
  }
  if (pattern === 'blocks') {
    return { courseHeight: size / 3.2, blockWidth: size / 1.45 };
  }
  if (pattern === 'rubble') {
    return { courseHeight: size / 4.6, blockWidth: size / 2.25 };
  }
  return { courseHeight: size / 4, blockWidth: size / 2 };
}

function structuralGroove(x, y, size, role, profile) {
  if (!['masonry', 'brick', 'ashlar', 'blocks', 'rubble', 'ruined'].includes(profile.pattern)) return 0;
  const { courseHeight, blockWidth } = patternDimensions(size, profile.pattern);
  const row = Math.floor(y / courseHeight);
  const irregular = profile.pattern === 'rubble' || profile.pattern === 'ruined';
  const rowJitter = irregular ? (noise(row, 0, profile.id.charCodeAt(0) + 47) - 0.5) * blockWidth * 0.22 : 0;
  const stagger = row % 2 ? blockWidth / 2 : 0;
  const shiftedX = x + stagger + rowJitter;
  const rowY = y - row * courseHeight;
  const blockX = ((shiftedX % blockWidth) + blockWidth) % blockWidth;
  const joint = Math.max(1.35, size / (profile.pattern === 'brick' ? 92 : 82));
  const roleScale = role === 'floor' ? 0.62 : 1;
  const horizontalJoint = Math.min(rowY, courseHeight - rowY) < joint;
  const verticalJoint = Math.min(blockX, blockWidth - blockX) < joint;
  if (horizontalJoint) return -0.56 * roleScale;
  if (verticalJoint) return -0.48 * roleScale;
  if (irregular && noise(Math.floor(x / 3), Math.floor(y / 3), 313) > 0.978) return -0.3 * roleScale;
  return 0;
}

function structuralBlockTone(x, y, size, seed, profile) {
  if (!['masonry', 'brick', 'ashlar', 'blocks', 'rubble', 'ruined'].includes(profile.pattern)) return 0;
  const { courseHeight, blockWidth } = patternDimensions(size, profile.pattern);
  const row = Math.floor(y / courseHeight);
  const stagger = row % 2 ? blockWidth / 2 : 0;
  const column = Math.floor((((x + stagger) % size) + size) % size / blockWidth);
  const amplitude = profile.pattern === 'brick' ? 26 : profile.pattern === 'rubble' ? 30 : 22;
  return (noise(column, row, seed + 131) - 0.5) * amplitude;
}

function baseShadeForProfile(profile, role) {
  const byId = {
    D01: 118, D02: 132, D03: 116, D04: 108, D05: 104, D06: 126,
    C01: 178, C02: 158, C03: 196, C04: 166, C05: 132, C06: 176,
    E01: 132, E02: 122, E03: 118, E04: 116, E05: 106, E06: 144,
    N01: 104, N02: 136, N03: 82, N04: 104, N05: 116, N06: 108,
    V01: 112, V02: 96, V03: 162, V04: 116, V05: 106, V06: 82,
  };
  let base = 120;
  if (Object.prototype.hasOwnProperty.call(byId, profile.id)) base = byId[profile.id];
  else if (profile.category === 'castle') base = 164;
  else if (profile.category === 'exterior') base = 126;
  else if (profile.category === 'cave') base = 98;
  else if (profile.category === 'variant') base = 112;

  if (profile.category === 'dungeon') base += role === 'wall' ? -20 : -6;
  if (profile.category === 'cave') base += role === 'wall' ? 0 : -46;
  return base;
}

function structuralEdgeWear(x, y, size, role, profile) {
  if (!['masonry', 'brick', 'ashlar', 'blocks', 'rubble', 'ruined'].includes(profile.pattern)) return 0;
  if (structuralGroove(x, y, size, role, profile) < 0) return 0;
  const adjacent = Math.min(
    structuralGroove(x + 1, y, size, role, profile),
    structuralGroove(x - 1, y, size, role, profile),
    structuralGroove(x, y + 1, size, role, profile),
    structuralGroove(x, y - 1, size, role, profile),
  );
  return adjacent < -0.2 ? 1 : 0;
}

function heightField(size, seed, profile) {
  const field = new Float32Array(size * size);
  const caveLike = ['cave', 'rock'].includes(profile.pattern);
  const smooth = ['marble', 'plaster', 'metal'].includes(profile.pattern);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const broad = noise(Math.floor(x / 14), Math.floor(y / 14), seed);
      const medium = noise(Math.floor(x / 4), Math.floor(y / 4), seed + 11);
      const fine = noise(x, y, seed + 29);
      const folded = Math.abs(Math.sin((x + seed * 0.7) * 0.073 + (y - seed * 0.4) * 0.051));
      const caveFold = caveLike ? (folded - 0.5) * 0.52 : 0;
      const caveShelf = caveLike
        ? Math.sin(y * 0.095 + Math.sin(x * 0.043 + seed) * 2.4) * 0.13
        : 0;
      const masonryFace = ['masonry', 'ashlar', 'blocks', 'brick', 'rubble', 'ruined'].includes(profile.pattern)
        ? (broad - 0.5) * 0.11 + (medium - 0.5) * 0.08
        : 0;
      const marbleWave = profile.pattern === 'marble'
        ? Math.sin(x * 0.055 + y * 0.031 + Math.sin(y * 0.09) * 2.2) * 0.07
        : 0;
      const earthRoll = profile.pattern === 'earth' ? (broad - 0.5) * 0.2 : 0;
      const crackThreshold = 0.996 - Math.min(0.9, profile.cracks) * 0.018;
      const crack = folded > crackThreshold && fine > 0.44 ? -0.25 * (0.45 + profile.cracks) : 0;
      const base = broad * 0.34 + medium * 0.26 + fine * 0.12
        + caveFold + caveShelf + masonryFace + marbleWave + earthRoll + crack;
      field[y * size + x] = base * profile.relief * (smooth ? 0.52 : 1);
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

function repeatScaleForProfile(profile) {
  if (profile.pattern === 'brick') return 1.22;
  if (profile.pattern === 'cave' || profile.pattern === 'rock') return 0.74;
  if (profile.pattern === 'marble') return 0.82;
  if (profile.pattern === 'earth') return 0.9;
  return 1;
}

function createMaterialTextureSet({
  size,
  seed,
  repeat,
  normalStrength,
  role,
  profile,
}) {
  const heights = heightField(size, seed, profile);
  const colorData = new Uint8Array(size * size * 4);
  const roughnessData = new Uint8Array(size * size * 4);
  const normalData = new Uint8Array(size * size * 4);
  const effectiveRepeat = repeat * repeatScaleForProfile(profile);

  const at = (x, y) => {
    const wrappedX = (x + size) % size;
    const wrappedY = (y + size) % size;
    return heights[wrappedY * size + wrappedX]
      + structuralGroove(wrappedX, wrappedY, size, role, profile);
  };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const height = at(x, y);
      const fine = noise(x, y, seed + 53);
      const mineralNoise = noise(Math.floor(x / 7), Math.floor(y / 7), seed + 71);
      const strata = Math.sin((y + seed * 3.7) * 0.11 + Math.sin(x * 0.045) * 1.8);
      const fissure = Math.max(0, 0.21 - height) * 34;
      const broadStain = noise(Math.floor(x / 18), Math.floor(y / 18), seed + 101);
      const blockTone = structuralBlockTone(x, y, size, seed, profile);
      const jointDepth = Math.max(0, -structuralGroove(x, y, size, role, profile));
      const edgeWear = structuralEdgeWear(x, y, size, role, profile);
      const caveStrata = ['cave', 'rock'].includes(profile.pattern)
        ? Math.sin(y * 0.13 + Math.sin(x * 0.052 + seed) * 2.1) * 22
        : 0;
      const chipMask = ['masonry', 'ashlar', 'blocks', 'brick', 'rubble', 'ruined'].includes(profile.pattern)
        && noise(Math.floor(x / 2), Math.floor(y / 2), seed + 151) > (0.986 - profile.cracks * 0.012)
        ? 1
        : 0;
      const marbleVein = profile.pattern === 'marble'
        ? Math.max(0, 0.18 - Math.abs(Math.sin(x * 0.045 + y * 0.071 + seed))) * 58
        : 0;
      const mossMask = profile.moss > 0
        ? Math.max(0, broadStain - (0.82 - profile.moss * 0.18)) * 5
        : 0;
      const wetMask = profile.moisture > 0
        ? Math.max(0, broadStain - 0.45) * profile.moisture
        : 0;
      const mineralMask = profile.mineral > 0
        ? Math.max(0, mineralNoise - 0.58) * profile.mineral * 2.2
        : 0;
      const sootMask = profile.soot > 0
        ? Math.max(0, 0.68 - broadStain) * profile.soot
        : 0;

      const baseShade = baseShadeForProfile(profile, role);
      const shade = baseShade + height * 47 + (fine - 0.5) * 18 + strata * 6 + caveStrata - fissure - marbleVein;
      const tint = profile.tint;
      const caveMaterial = profile.category === 'cave';
      const dampDarken = wetMask * (caveMaterial ? 22 : 42);
      const sootDarken = sootMask * 45;
      const mortarDarken = jointDepth * 145;
      const chipDarken = chipMask * (18 + profile.cracks * 18);
      const edgeLift = edgeWear * (10 + Math.max(0, profile.relief - 0.5) * 8);
      const mineralBoost = caveMaterial ? 1.8 : 1;
      const wetHighlight = caveMaterial ? wetMask * 10 : 0;
      colorData[index] = clampByte(shade + tint[0] * 1.45 + blockTone + edgeLift + wetHighlight * 0.25 - dampDarken - sootDarken - mortarDarken - chipDarken - mossMask * 24 + mineralMask * 14 * mineralBoost);
      colorData[index + 1] = clampByte(shade + tint[1] * 1.45 + blockTone * 0.72 + edgeLift + wetHighlight * 0.55 - dampDarken * 0.9 - sootDarken - mortarDarken * 0.92 - chipDarken + mossMask * 20 + mineralMask * 18 * mineralBoost);
      colorData[index + 2] = clampByte(shade + tint[2] * 1.45 + blockTone * 0.45 + edgeLift + wetHighlight - dampDarken * 0.72 - sootDarken - mortarDarken * 0.82 - chipDarken - mossMask * 18 + mineralMask * 34 * mineralBoost);
      colorData[index + 3] = 255;

      const roughness = 202
        + profile.roughnessBias * 90
        + (1 - Math.max(-0.2, Math.min(0.8, height))) * 28
        + fine * 12
        + Math.abs(strata) * 4
        - wetMask * 42;
      const roughnessByte = clampByte(roughness);
      roughnessData[index] = roughnessByte;
      roughnessData[index + 1] = roughnessByte;
      roughnessData[index + 2] = roughnessByte;
      roughnessData[index + 3] = 255;

      const strength = normalStrength * profile.normalScale;
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const invLength = 1 / Math.max(0.0001, Math.hypot(dx, dy, 1));
      normalData[index] = clampByte(((-dx * invLength) * 0.5 + 0.5) * 255);
      normalData[index + 1] = clampByte(((-dy * invLength) * 0.5 + 0.5) * 255);
      normalData[index + 2] = clampByte(((1 * invLength) * 0.5 + 0.5) * 255);
      normalData[index + 3] = 255;
    }
  }

  return {
    profileId: profile.id,
    color: textureFromData(colorData, size, 'chronicles-material-' + profile.id + '-color-' + seed, {
      colorSpace: THREE.SRGBColorSpace,
      repeat: effectiveRepeat,
    }),
    roughness: textureFromData(roughnessData, size, 'chronicles-material-' + profile.id + '-roughness-' + seed, {
      repeat: effectiveRepeat,
    }),
    normal: textureFromData(normalData, size, 'chronicles-material-' + profile.id + '-normal-' + seed, {
      repeat: effectiveRepeat,
    }),
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
  if (name.startsWith('chronicles-iso-wall-') || name.startsWith('chronicles-iso-wall-cap-')) return 'wall';
  if (hasAncestorPrefix(node, 'chronicles-iso-column-')) return 'wall';
  if (hasAncestorPrefix(node, 'chronicles-iso-far-shrine')) return 'wall';
  return null;
}

function applyTextureSet(material, set, normalStrength, profile, role) {
  if (!material?.isMeshStandardMaterial) return null;
  const prior = {
    map: material.map,
    roughnessMap: material.roughnessMap,
    normalMap: material.normalMap,
    normalScale: material.normalScale?.clone?.() || null,
    emissiveMap: material.emissiveMap,
    emissive: material.emissive?.clone?.() || null,
    emissiveIntensity: material.emissiveIntensity,
    color: material.color?.clone?.() || null,
    roughness: material.roughness,
  };

  material.map = set.color;
  material.roughnessMap = set.roughness;
  material.normalMap = set.normal;
  material.normalScale = new THREE.Vector2(normalStrength, normalStrength);
  if (material.color) {
    if (profile.category === 'cave' && role === 'floor') material.color.setRGB(0.42, 0.45, 0.47);
    else if (profile.category === 'cave' && role === 'wall') material.color.setRGB(0.7, 0.74, 0.76);
    else material.color.setRGB(1, 1, 1);
  }
  if (profile.category === 'cave' && role === 'wall' && material.emissive) {
    material.emissiveMap = set.color;
    material.emissive.setRGB(0.08, 0.11, 0.12);
    material.emissiveIntensity = 0.12;
  }
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
    material.emissiveMap = prior.emissiveMap;
    if (prior.emissive && material.emissive) material.emissive.copy(prior.emissive);
    material.emissiveIntensity = prior.emissiveIntensity;
    if (prior.color && material.color) material.color.copy(prior.color);
    material.roughness = prior.roughness;
    material.needsUpdate = true;
  };
}

export function installChroniclesTacticsPremiumMaterials(scene, {
  coarsePointer = false,
  scenePlan = null,
} = {}) {
  if (!scene?.add || !scene?.traverse) return null;
  const existing = scene.getObjectByName?.(ROOT_NAME);
  if (existing) return existing;

  const size = coarsePointer
    ? CHRONICLES_TACTICS_MATERIAL_STYLE.coarseTextureSize
    : CHRONICLES_TACTICS_MATERIAL_STYLE.desktopTextureSize;
  const plan = chroniclesMaterialPlanForScene(scenePlan);
  const profileIdsByRole = {
    floor: plan.floorProfileIds,
    wall: plan.wallProfileIds,
  };
  const roleStrength = {
    floor: CHRONICLES_TACTICS_MATERIAL_STYLE.floorNormalStrength,
    wall: CHRONICLES_TACTICS_MATERIAL_STYLE.wallNormalStrength,
  };
  const roleRepeat = {
    floor: CHRONICLES_TACTICS_MATERIAL_STYLE.floorRepeat,
    wall: CHRONICLES_TACTICS_MATERIAL_STYLE.wallRepeat,
  };

  const root = new THREE.Group();
  root.name = ROOT_NAME;
  const restores = [];
  const visited = new Set();
  const roleCounters = { floor: 0, wall: 0 };
  const textureSets = new Map();

  function textureSetFor(role, profileId, index) {
    const cacheKey = role + ':' + profileId;
    if (textureSets.has(cacheKey)) return textureSets.get(cacheKey);
    const profile = chroniclesMaterialProfile(profileId);
    const set = createMaterialTextureSet({
      size,
      seed: (plan.seed + index * 97 + (role === 'wall' ? 47 : 23)) >>> 0,
      repeat: roleRepeat[role],
      normalStrength: roleStrength[role],
      role,
      profile,
    });
    textureSets.set(cacheKey, set);
    return set;
  }

  scene.traverse((node) => {
    if (!node?.isMesh) return;
    const role = chroniclesTacticsMaterialRole(node);
    if (!role) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.filter(Boolean).forEach((material) => {
      const key = role + ':' + material.uuid;
      if (visited.has(key)) return;
      visited.add(key);
      const candidates = profileIdsByRole[role];
      const profileIndex = roleCounters[role] % candidates.length;
      const profileId = candidates[profileIndex];
      roleCounters[role] += 1;
      const set = textureSetFor(role, profileId, profileIndex);
      const profile = chroniclesMaterialProfile(profileId);
      const restore = applyTextureSet(material, set, roleStrength[role] * profile.normalScale, profile, role);
      if (restore) restores.push(restore);
    });
  });

  root.userData.chroniclesArtCancel = () => {
    restores.splice(0).reverse().forEach((restore) => restore());
    textureSets.forEach((set) => {
      set.color.dispose();
      set.roughness.dispose();
      set.normal.dispose();
    });
    textureSets.clear();
  };
  root.userData.chroniclesMaterialFinish = 'semantic-atlas-procedural-pbr-v1';
  root.userData.chroniclesMasonryProfile = 'approved-material-atlas-v1';
  root.userData.chroniclesMaterialEnvironment = plan.environmentId;
  root.userData.chroniclesMaterialSeed = plan.seed;
  root.userData.chroniclesMaterialProfiles = Object.freeze({
    wall: Object.freeze([...plan.wallProfileIds]),
    floor: Object.freeze([...plan.floorProfileIds]),
  });
  root.userData.chroniclesMaterialCount = visited.size;
  scene.add(root);
  return root;
}
