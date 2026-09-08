import * as THREE from 'three';

export const PAWN_SLUG_PLATFORM_LAYOUT = Object.freeze([
  Object.freeze({ id: 'ruin-steps-a', x: 14.2, y: 1.05, width: 3.3, depth: 1.45, theme: 'stone' }),
  Object.freeze({ id: 'ruin-steps-b', x: 18.1, y: 2.35, width: 2.7, depth: 1.4, theme: 'stone' }),
  Object.freeze({ id: 'watch-post', x: 24.7, y: 3.5, width: 4.4, depth: 1.55, theme: 'timber' }),
  Object.freeze({ id: 'broken-bridge-a', x: 33.6, y: 1.55, width: 4.9, depth: 1.35, theme: 'steel' }),
  Object.freeze({ id: 'broken-bridge-b', x: 39.2, y: 3.0, width: 3.0, depth: 1.35, theme: 'steel' }),
  Object.freeze({ id: 'factory-catwalk', x: 48.8, y: 4.15, width: 6.2, depth: 1.5, theme: 'steel' }),
  Object.freeze({ id: 'shell-crater-rim', x: 59.5, y: 1.35, width: 4.1, depth: 1.45, theme: 'stone' }),
  Object.freeze({ id: 'signal-platform', x: 67.7, y: 3.1, width: 3.9, depth: 1.45, theme: 'timber' }),
  Object.freeze({ id: 'bunker-roof', x: 77.6, y: 2.15, width: 6.8, depth: 1.65, theme: 'stone' }),
  Object.freeze({ id: 'gantry-lower', x: 88.0, y: 1.55, width: 4.5, depth: 1.35, theme: 'steel' }),
  Object.freeze({ id: 'gantry-upper', x: 93.0, y: 3.65, width: 4.1, depth: 1.35, theme: 'steel' }),
  Object.freeze({ id: 'last-line-wall', x: 103.3, y: 2.25, width: 5.1, depth: 1.6, theme: 'stone' }),
  Object.freeze({ id: 'boss-approach', x: 109.1, y: 3.65, width: 3.4, depth: 1.5, theme: 'steel' }),
]);

export const PAWN_SLUG_PLATFORM_META = Object.freeze({
  oneWay: true,
  jumpThroughFromBelow: true,
  platformCount: PAWN_SLUG_PLATFORM_LAYOUT.length,
  maxHeight: Math.max(...PAWN_SLUG_PLATFORM_LAYOUT.map((platform) => platform.y)),
  coarseDecoration: false,
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
  return {
    left: platform.x - half,
    right: platform.x + half,
    top: platform.y,
  };
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

export function pawnSlugResolvePlatformLanding({
  previousY,
  nextY,
  vy,
  left,
  right,
  dropThrough = false,
}, platforms = PAWN_SLUG_PLATFORM_LAYOUT) {
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

export function pawnSlugPlatformSupportY({
  x,
  feetY,
  tolerance = 0.08,
}, platforms = PAWN_SLUG_PLATFORM_LAYOUT) {
  let support = 0;
  for (const platform of platforms) {
    const { left, right, top } = pawnSlugPlatformBounds(platform);
    if (x < left || x > right) continue;
    if (Math.abs(feetY - top) <= tolerance) support = Math.max(support, top);
  }
  return support;
}

export function pawnSlugPlatformCameraY(playerY, {
  groundCameraY = 5.1,
  minPlayerY = 1.2,
  maxLift = 2.7,
} = {}) {
  const lift = clamp((playerY - minPlayerY) * 0.55, 0, maxLift);
  return groundCameraY + lift;
}

export function pawnSlugPlatformLookAtY(playerY, {
  groundLookAtY = 4.25,
  minPlayerY = 1.2,
  maxLift = 2.1,
} = {}) {
  const lift = clamp((playerY - minPlayerY) * 0.43, 0, maxLift);
  return groundLookAtY + lift;
}

function material(color, roughness = 0.83, metalness = 0.04) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function addPlatformVisual(root, platform, materials, { coarse }) {
  const palette = THEME_MATERIALS[platform.theme] || THEME_MATERIALS.stone;
  const group = new THREE.Group();
  group.name = `pawn-slug-platform-${platform.id}`;
  group.position.set(platform.x, platform.y, -0.06);

  const slabHeight = platform.theme === 'steel' ? 0.2 : 0.3;
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(platform.width, slabHeight, platform.depth),
    materials[`${platform.theme}Side`],
  );
  slab.position.y = -slabHeight / 2;
  slab.castShadow = !coarse;
  slab.receiveShadow = true;
  group.add(slab);

  const top = new THREE.Mesh(
    new THREE.BoxGeometry(platform.width + 0.05, 0.075, platform.depth + 0.04),
    materials[`${platform.theme}Top`],
  );
  top.position.y = 0.018;
  top.castShadow = !coarse;
  top.receiveShadow = true;
  group.add(top);

  if (!coarse) {
    const trimGeo = new THREE.BoxGeometry(platform.width + 0.08, 0.08, 0.09);
    for (const z of [-platform.depth / 2 - 0.015, platform.depth / 2 + 0.015]) {
      const trim = new THREE.Mesh(trimGeo, materials[`${platform.theme}Trim`]);
      trim.position.set(0, -0.065, z);
      trim.castShadow = true;
      group.add(trim);
    }

    if (platform.theme === 'timber') {
      const postGeo = new THREE.BoxGeometry(0.12, Math.max(0.8, platform.y), 0.12);
      for (const x of [-platform.width * 0.35, platform.width * 0.35]) {
        const post = new THREE.Mesh(postGeo, materials.timberSide);
        post.position.set(x, -Math.max(0.8, platform.y) / 2 - 0.14, 0);
        post.rotation.z = x < 0 ? -0.03 : 0.03;
        group.add(post);
      }
    } else if (platform.theme === 'steel') {
      const braceGeo = new THREE.BoxGeometry(0.095, Math.max(0.7, platform.y * 0.78), 0.095);
      for (const x of [-platform.width * 0.37, platform.width * 0.37]) {
        const brace = new THREE.Mesh(braceGeo, materials.steelSide);
        brace.position.set(x, -Math.max(0.7, platform.y * 0.78) / 2 - 0.12, 0);
        brace.rotation.z = x < 0 ? -0.24 : 0.24;
        group.add(brace);
      }
    }
  }

  root.add(group);
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

  for (const platform of PAWN_SLUG_PLATFORM_LAYOUT) {
    addPlatformVisual(root, platform, materials, { coarse });
  }

  parent?.add(root);
  root.userData.platforms = PAWN_SLUG_PLATFORM_LAYOUT;
  root.userData.dispose = () => {
    root.traverse((child) => {
      child.geometry?.dispose?.();
    });
    for (const value of Object.values(materials)) value.dispose?.();
  };
  return root;
}
