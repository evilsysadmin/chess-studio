import * as THREE from 'three';
import { PAWN_SLUG_PLATFORM_LAYOUT } from './pawnSlugTileMaps.js';
import {
  PAWN_SLUG_STATIC_INSTANCE_VERSION,
  createPawnSlugStaticInstanceBatch,
} from './pawnSlugStaticInstances.js';

export { PAWN_SLUG_PLATFORM_LAYOUT } from './pawnSlugTileMaps.js';

export const PAWN_SLUG_PLATFORM_META = Object.freeze({
  oneWay: true,
  jumpThroughFromBelow: true,
  platformCount: PAWN_SLUG_PLATFORM_LAYOUT.length,
  maxHeight: Math.max(...PAWN_SLUG_PLATFORM_LAYOUT.map((platform) => platform.y)),
  coarseDecoration: 'front-lip',
  source: 'tile-map',
  renderBatching: PAWN_SLUG_STATIC_INSTANCE_VERSION,
  desktopVisualBatchBudget: 11,
  coarseVisualBatchBudget: 9,
});

export const PAWN_SLUG_CAMERA_VERTICAL_META = Object.freeze({
  groundCameraY: 3.75,
  groundLookAtY: 2.9,
  minPlayerY: 1.2,
  maxCameraLift: 2.7,
  maxLookAtLift: 2.1,
});

const THEME_MATERIALS = Object.freeze({
  stone: Object.freeze({ top: 0x7f7569, side: 0x3f3a35, trim: 0xa38d70 }),
  timber: Object.freeze({ top: 0x765438, side: 0x38281d, trim: 0xaa7a4b }),
  steel: Object.freeze({ top: 0x6d7478, side: 0x31363a, trim: 0x9a835f }),
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function pawnSlugPlatformBounds(platform) {
  const half = platform.width / 2;
  return { left: platform.x - half, right: platform.x + half, top: platform.y };
}

export function pawnSlugPlatformAtX(x, platforms = PAWN_SLUG_PLATFORM_LAYOUT) {
  let best = null;
  for (const platform of platforms) {
    const { left, right } = pawnSlugPlatformBounds(platform);
    if (x < left || x > right) continue;
    if (!best || platform.y > best.y) best = platform;
  }
  return best;
}

export function pawnSlugResolvePlatformLanding({ previousY, nextY, vy, left, right, dropThrough = false }, platforms = PAWN_SLUG_PLATFORM_LAYOUT) {
  if (dropThrough || vy > 0) return null;
  let landing = null;
  for (const platform of platforms) {
    const bounds = pawnSlugPlatformBounds(platform);
    if (right <= bounds.left || left >= bounds.right) continue;
    if (previousY + 0.001 < bounds.top) continue;
    if (nextY > bounds.top) continue;
    if (!landing || bounds.top > landing.y) landing = platform;
  }
  return landing;
}

export function pawnSlugPlatformSupportY({ x, feetY, tolerance = 0.08 }, platforms = PAWN_SLUG_PLATFORM_LAYOUT) {
  let support = 0;
  for (const platform of platforms) {
    const { left, right, top } = pawnSlugPlatformBounds(platform);
    if (x < left || x > right) continue;
    if (Math.abs(feetY - top) <= tolerance) support = Math.max(support, top);
  }
  return support;
}

export function pawnSlugPlatformCameraY(playerY, {
  groundCameraY = PAWN_SLUG_CAMERA_VERTICAL_META.groundCameraY,
  minPlayerY = PAWN_SLUG_CAMERA_VERTICAL_META.minPlayerY,
  maxLift = PAWN_SLUG_CAMERA_VERTICAL_META.maxCameraLift,
} = {}) {
  const lift = clamp((playerY - minPlayerY) * 0.55, 0, maxLift);
  return groundCameraY + lift;
}

export function pawnSlugPlatformLookAtY(playerY, {
  groundLookAtY = PAWN_SLUG_CAMERA_VERTICAL_META.groundLookAtY,
  minPlayerY = PAWN_SLUG_CAMERA_VERTICAL_META.minPlayerY,
  maxLift = PAWN_SLUG_CAMERA_VERTICAL_META.maxLookAtLift,
} = {}) {
  const lift = clamp((playerY - minPlayerY) * 0.43, 0, maxLift);
  return groundLookAtY + lift;
}

function material(color, roughness = 0.83, metalness = 0.04) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function push(bucket, instance) {
  bucket.push(instance);
}

function addPlatformCompatibilityMarkers(root, platform, coarse) {
  const group = new THREE.Group();
  group.name = `pawn-slug-platform-${platform.id}`;
  group.position.set(platform.x, platform.y, -0.06);
  group.userData.pawnSlugBatchedPlatformMarker = true;

  const frontLip = new THREE.Object3D();
  frontLip.name = `pawn-slug-platform-${platform.id}-front-lip`;
  frontLip.position.set(0, -0.065, platform.depth / 2 + 0.015);
  frontLip.castShadow = !coarse;
  group.add(frontLip);

  if (!coarse) {
    const rearLip = new THREE.Object3D();
    rearLip.name = `pawn-slug-platform-${platform.id}-rear-lip`;
    rearLip.position.set(0, -0.065, -platform.depth / 2 - 0.015);
    rearLip.castShadow = true;
    group.add(rearLip);
  }
  root.add(group);
}

function platformInstanceBuckets(coarse) {
  const buckets = {};
  for (const theme of Object.keys(THEME_MATERIALS)) {
    buckets[`${theme}Slab`] = [];
    buckets[`${theme}Top`] = [];
    buckets[`${theme}Trim`] = [];
  }
  buckets.timberSupport = [];
  buckets.steelSupport = [];

  for (const platform of PAWN_SLUG_PLATFORM_LAYOUT) {
    const baseZ = -0.06;
    const slabHeight = platform.theme === 'steel' ? 0.2 : 0.3;
    push(buckets[`${platform.theme}Slab`], {
      x: platform.x,
      y: platform.y - slabHeight / 2,
      z: baseZ,
      sx: platform.width,
      sy: slabHeight,
      sz: platform.depth,
    });
    push(buckets[`${platform.theme}Top`], {
      x: platform.x,
      y: platform.y + 0.018,
      z: baseZ,
      sx: platform.width + 0.05,
      sy: 0.075,
      sz: platform.depth + 0.04,
    });
    push(buckets[`${platform.theme}Trim`], {
      x: platform.x,
      y: platform.y - 0.065,
      z: baseZ + platform.depth / 2 + 0.015,
      sx: platform.width + 0.08,
      sy: 0.08,
      sz: 0.09,
    });
    if (!coarse) {
      push(buckets[`${platform.theme}Trim`], {
        x: platform.x,
        y: platform.y - 0.065,
        z: baseZ - platform.depth / 2 - 0.015,
        sx: platform.width + 0.08,
        sy: 0.08,
        sz: 0.09,
      });
      if (platform.theme === 'timber') {
        const height = Math.max(0.8, platform.y);
        for (const x of [-platform.width * 0.35, platform.width * 0.35]) {
          push(buckets.timberSupport, {
            x: platform.x + x,
            y: platform.y - height / 2 - 0.14,
            z: baseZ,
            rz: x < 0 ? -0.03 : 0.03,
            sx: 0.12,
            sy: height,
            sz: 0.12,
          });
        }
      } else if (platform.theme === 'steel') {
        const height = Math.max(0.7, platform.y * 0.78);
        for (const x of [-platform.width * 0.37, platform.width * 0.37]) {
          push(buckets.steelSupport, {
            x: platform.x + x,
            y: platform.y - height / 2 - 0.12,
            z: baseZ,
            rz: x < 0 ? -0.24 : 0.24,
            sx: 0.095,
            sy: height,
            sz: 0.095,
          });
        }
      }
    }
  }
  return buckets;
}

export function createPawnSlugPlatforms(parent, { coarse = false } = {}) {
  const root = new THREE.Group();
  root.name = 'pawn-slug-platforms';
  const materials = {};
  for (const [theme, palette] of Object.entries(THEME_MATERIALS)) {
    materials[`${theme}Top`] = material(palette.top, theme === 'steel' ? 0.58 : 0.88, theme === 'steel' ? 0.38 : 0.03);
    materials[`${theme}Side`] = material(palette.side, theme === 'steel' ? 0.64 : 0.92, theme === 'steel' ? 0.42 : 0.02);
    materials[`${theme}Trim`] = material(palette.trim, 0.7, theme === 'steel' ? 0.32 : 0.05);
  }

  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const buckets = platformInstanceBuckets(coarse);
  let visualBatchCount = 0;
  let visualInstanceCount = 0;

  function addBatch(name, instances, materialValue, { castShadow = !coarse } = {}) {
    const batch = createPawnSlugStaticInstanceBatch({
      name,
      geometry: unitBox,
      material: materialValue,
      instances,
      castShadow,
      receiveShadow: true,
    });
    if (!batch) return;
    batch.userData.pawnSlugPlatformBatch = true;
    visualBatchCount += 1;
    visualInstanceCount += batch.count;
    root.add(batch);
  }

  for (const theme of Object.keys(THEME_MATERIALS)) {
    addBatch(`pawn-slug-platform-${theme}-slabs-instanced`, buckets[`${theme}Slab`], materials[`${theme}Side`]);
    addBatch(`pawn-slug-platform-${theme}-tops-instanced`, buckets[`${theme}Top`], materials[`${theme}Top`]);
    addBatch(`pawn-slug-platform-${theme}-trims-instanced`, buckets[`${theme}Trim`], materials[`${theme}Trim`]);
  }
  if (!coarse) {
    addBatch('pawn-slug-platform-timber-supports-instanced', buckets.timberSupport, materials.timberSide, { castShadow: false });
    addBatch('pawn-slug-platform-steel-supports-instanced', buckets.steelSupport, materials.steelSide, { castShadow: false });
  }

  for (const platform of PAWN_SLUG_PLATFORM_LAYOUT) addPlatformCompatibilityMarkers(root, platform, coarse);

  parent?.add(root);
  root.userData.platforms = PAWN_SLUG_PLATFORM_LAYOUT;
  root.userData.pawnSlugPlatformVisualBatches = visualBatchCount;
  root.userData.pawnSlugPlatformVisualInstances = visualInstanceCount;
  root.userData.dispose = () => {
    unitBox.dispose();
    for (const value of Object.values(materials)) value.dispose?.();
  };
  return root;
}
