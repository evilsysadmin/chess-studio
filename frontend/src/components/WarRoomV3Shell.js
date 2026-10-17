import * as THREE from 'three';
import { createWarRoomBlenderVariantShell } from './WarRoomBlenderShellRuntime.js';
import { WAR_ROOM_V3_RUNTIME_ASSET_URL } from './WarRoomV3Asset.js';
import { installWarRoomV3FireAnimation } from './WarRoomV3Fire.js';
import { createWarRoomSideTorch } from './WarRoomMilitaryGallery.js';

// Content-addressed copy of the verified #5721 live GLB. It preserves the
// authored Hans stage; prefetch and runtime read the same immutable bytes.
export const WAR_ROOM_V3_RUNTIME_MODEL_URL = WAR_ROOM_V3_RUNTIME_ASSET_URL;

// The armory hall burns a wide log fire in a great hearth, not a small stove.
export const WAR_ROOM_V3_HEARTH_FIRE_SHAPE = Object.freeze({
  height: 0.85,
  spreadX: 0.42,
  spreadZ: 0.10,
  size: 0.22,
});

// Side-wall torches are the War Room v1 gothic sconce-braziers, mounted on the
// authored `WR3_ANCHOR_torch_*` empties (their +z already points into the hall).
export const WAR_ROOM_V3_TORCH_ANCHOR_PREFIX = 'WR3_ANCHOR_torch_';

// Torches are the main light of the hall on desktop: brighter and wider than v1.
export const WAR_ROOM_V3_TORCH_LIGHT = Object.freeze({ intensity: 20, distance: 11 });
// Touch keeps every authored flame, but only one real point light per side wall.
// This preserves the torchlit identity without paying for all six practicals.
export const WAR_ROOM_V3_TOUCH_TORCH_LIGHT = Object.freeze({
  intensity: 16.5,
  distance: 11,
  maxLights: 2,
});

export const WAR_ROOM_V3_TOUCH_HEARTH_WASH = Object.freeze({
  color: 0xffb36b,
  intensity: 46,
  distance: 15,
  angle: Math.PI / 2.8,
  penumbra: 0.72,
  decay: 2,
  target: Object.freeze([0, 1.12, 0]),
});

function selectWarRoomV3TouchTorchAnchors(anchors) {
  const selected = [];
  for (const side of [-1, 1]) {
    const candidates = anchors
      .filter((anchor) => Math.sign(Number(anchor.position?.x) || 0) === side)
      .sort((a, b) => (
        Math.abs(Number(a.position?.z) || 0) - Math.abs(Number(b.position?.z) || 0)
        || a.name.localeCompare(b.name)
      ));
    if (candidates[0]) selected.push(candidates[0]);
  }
  for (const anchor of anchors) {
    if (selected.length >= WAR_ROOM_V3_TOUCH_TORCH_LIGHT.maxLights) break;
    if (!selected.includes(anchor)) selected.push(anchor);
  }
  return new Set(selected.slice(0, WAR_ROOM_V3_TOUCH_TORCH_LIGHT.maxLights));
}

// The six authored torch anchors never animate: one desktop instanced draw
// per metal-hardware family can replace six identical per-sconce submissions.
// Flame meshes and independent light/material/kinetics nodes remain untouched.
export const WAR_ROOM_V3_STATIC_TORCH_FAMILIES = Object.freeze([
  'war-room-side-torch-backplate-finial',
  'war-room-side-torch-rivet',
  'war-room-side-torch-cage-bar',
  'war-room-side-torch-crown-spike',
  // Larger, still-inert metal shapes are the visible draw-call offenders.
  // Halos have per-torch textures; flame meshes have independent callbacks.
  'war-room-side-torch-backplate',
  'war-room-side-torch-wall-arm',
  'war-room-side-torch-arm-collar',
  'war-room-side-torch-neck',
  'war-room-side-torch-brazier-bowl',
  'war-room-side-torch-brazier-rim',
  'war-room-side-torch-embers',
]);

function sameHardwareMaterial(a, b) {
  // These four families use only the common, untextured iron/ironHighlight
  // finish. Fail closed if an authored material is customized per torch.
  return a?.type === b?.type
    && a?.color?.getHex() === b?.color?.getHex()
    && a?.metalness === b?.metalness
    && a?.roughness === b?.roughness
    && a?.clearcoat === b?.clearcoat
    && a?.clearcoatRoughness === b?.clearcoatRoughness
    && a?.emissive?.getHex?.() === b?.emissive?.getHex?.()
    && a?.emissiveIntensity === b?.emissiveIntensity
    && a?.specularIntensity === b?.specularIntensity
    && a?.map === b?.map
    && a?.transparent === b?.transparent
    && a?.opacity === b?.opacity
    && a?.blending === b?.blending
    && a?.depthWrite === b?.depthWrite
    && a?.side === b?.side;
}

export function batchWarRoomV3StaticTorchHardware(root, torches) {
  const merged = [];
  const detached = [];
  if (!root?.isObject3D || torches.length < 2) return { merged, detached };

  // Compute all transforms in *root local* space, so the complete hall may
  // move later without desynchronizing the authored wall anchors.
  root.updateWorldMatrix(true, true);
  const rootInverse = root.matrixWorld.clone().invert();
  const torchToRoot = new THREE.Matrix4();
  const local = new THREE.Matrix4();
  const final = new THREE.Matrix4();

  for (const name of WAR_ROOM_V3_STATIC_TORCH_FAMILIES) {
    const parts = torches.map((torch) => torch.getObjectByName(name));
    if (parts.some((part) => !part?.isMesh || part.onBeforeRender)) continue;
    const geometry = parts[0].geometry;
    const material = parts[0].material;
    if (parts.some((part) => (
      part.geometry !== geometry
      || part.castShadow !== parts[0].castShadow
      || part.receiveShadow !== parts[0].receiveShadow
      || !sameHardwareMaterial(part.material, material)
    ))) continue;

    const combined = new THREE.InstancedMesh(
      geometry, material, parts.reduce((total, part) => total + (part.isInstancedMesh ? part.count : 1), 0),
    );
    combined.name = name;
    combined.userData.warRoomV3MergedTorchHardware = true;
    combined.castShadow = parts[0].castShadow;
    combined.receiveShadow = parts[0].receiveShadow;
    let cursor = 0;
    for (const part of parts) {
      torchToRoot.multiplyMatrices(rootInverse, part.matrixWorld);
      for (let index = 0, count = part.isInstancedMesh ? part.count : 1; index < count; index += 1) {
        if (part.isInstancedMesh) part.getMatrixAt(index, local);
        else local.identity();
        final.multiplyMatrices(torchToRoot, local);
        combined.setMatrixAt(cursor, final);
        cursor += 1;
      }
      part.removeFromParent();
      detached.push(part);
    }
    combined.instanceMatrix.needsUpdate = true;
    combined.computeBoundingSphere();
    root.add(combined);
    merged.push(combined);
  }
  return { merged, detached };
}

export function installWarRoomV3Torches(root, {
  coarsePointer = false,
  // Software-renderer "lite" also enables coarsePointer for lighting, even
  // on desktop. Keep touch frustum culling independent of that quality flag.
  touchHardwareCulling = Boolean(globalThis.matchMedia?.('(pointer: coarse)')?.matches),
} = {}) {
  const anchors = [];
  root?.traverse?.((node) => {
    if (node.name?.startsWith(WAR_ROOM_V3_TORCH_ANCHOR_PREFIX)) anchors.push(node);
  });
  anchors.sort((a, b) => a.name.localeCompare(b.name));
  const touchLightAnchors = coarsePointer ? selectWarRoomV3TouchTorchAnchors(anchors) : new Set();
  const lightProfile = coarsePointer ? WAR_ROOM_V3_TOUCH_TORCH_LIGHT : WAR_ROOM_V3_TORCH_LIGHT;
  const sharedStaticHardwareGeometries = new Map();
  const torches = anchors.map((anchor, index) => {
    const torch = createWarRoomSideTorch({
      side: anchor.position.x < 0 ? -1 : 1,
      phase: 0.7 + index * 1.37,
      withLight: !coarsePointer || touchLightAnchors.has(anchor),
      lightIntensity: lightProfile.intensity,
      lightDistance: lightProfile.distance,
      batchStaticHardware: true,
      sharedStaticHardwareGeometries,
    });
    torch.userData.warRoomV3Torch = anchor.name;
    anchor.add(torch);
    return torch;
  });
  // Rendering-lite is not evidence of a touch device. Desktop SwiftShader
  // still batches; actual touch devices retain separate per-torch culling.
  const { merged, detached } = touchHardwareCulling
    ? { merged: [], detached: [] }
    : batchWarRoomV3StaticTorchHardware(root, torches);
  if (root?.userData) {
    root.userData.warRoomV3StaticTorchBatches = merged.length;
    root.userData.warRoomV3Torches = torches.length;
    if (coarsePointer) root.userData.warRoomV3TouchTorchLights = touchLightAnchors.size;
  }
  return () => {
    const disposedGeometries = new Set();
    const disposedTextures = new Set();
    const disposedMaterials = new Set();
    [...torches, ...merged, ...detached].forEach((torch) => {
      torch.removeFromParent();
      torch.traverse((node) => {
        const geometry = node.geometry;
        if (geometry && !disposedGeometries.has(geometry)) {
          disposedGeometries.add(geometry);
          geometry.dispose?.();
        }
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        materials.forEach((material) => {
          if (!material) return;
          if (material.map && !disposedTextures.has(material.map)) {
            disposedTextures.add(material.map);
            material.map.dispose?.();
          }
          if (!disposedMaterials.has(material)) {
            disposedMaterials.add(material);
            material.dispose?.();
          }
        });
      });
    });
    sharedStaticHardwareGeometries.clear();
    if (root?.userData) {
      delete root.userData.warRoomV3Torches;
      delete root.userData.warRoomV3StaticTorchBatches;
      delete root.userData.warRoomV3TouchTorchLights;
    }
  };
}

// Torchlit grade for the hall. Practicals: no back-wall lantern (the torches
// replace it), a hotter hearth, a fainter moon. Scene fill: the shared
// hemisphere and image-based light drop, less on touch where only two torches carry real light.
export const WAR_ROOM_V3_PRACTICAL_SCALE = Object.freeze({
  'war-room-blender-chandelier-practical': Object.freeze({ desktop: 0, touch: 0 }),
  // Portrait crops the side-wall torches, so touch lets the visible hearth carry
  // more of the central room instead of compensating with non-diegetic exposure.
  'war-room-blender-fire-practical': Object.freeze({ desktop: 1.35, touch: 2.05 }),
  'war-room-blender-moon-practical': Object.freeze({ desktop: 0.5, touch: 0.82 }),
});
// The shared desktop IBL (RoomEnvironment) lights the hall evenly from every
// side, which flattens torchlight. three.js applies scene.environmentIntensity
// (not material.envMapIntensity) to materials lit by scene.environment, and
// the IBL assigns it after first paint, so the grade scales that property for
// as long as the hall is mounted, whatever value is written to it. Touch/lite
// has no IBL at all.
export const WAR_ROOM_V3_SCENE_FILL = Object.freeze({
  hemisphere: Object.freeze({ desktop: 0.4, touch: 0.65 }),
  environment: Object.freeze({ desktop: 0.28, touch: 1 }),
});

// Desktop: a warm pool of light over the board replaces most of the global key,
// so the hall around it stays dark and torchlit while play stays legible.
// Coordinates are shell-root space (board top at WR_ANCHOR_board_origin, y 1.12).
export const WAR_ROOM_V3_BOARD_POOL = Object.freeze({
  color: 0xffd9a8,
  intensity: 150,
  angle: 0.5,
  penumbra: 0.55,
  decay: 2,
  position: Object.freeze([0, 12.5, 0.6]),
  target: Object.freeze([0, 1.12, 0]),
});

export function tuneWarRoomV3Lighting(root, { coarsePointer = false } = {}) {
  const device = coarsePointer ? 'touch' : 'desktop';
  const restores = [];
  root?.traverse?.((node) => {
    const scale = WAR_ROOM_V3_PRACTICAL_SCALE[node.name];
    if (!node.isPointLight || scale === undefined) return;
    const intensity = node.intensity;
    node.intensity *= scale[device];
    restores.push(() => { node.intensity = intensity; });
  });

  if (coarsePointer && root?.add) {
    const hearthAnchor = root.getObjectByName?.('WR_ANCHOR_fireplace_practical');
    if (hearthAnchor) {
      const wash = WAR_ROOM_V3_TOUCH_HEARTH_WASH;
      const target = new THREE.Object3D();
      target.name = 'war-room-v3-touch-hearth-target';
      target.position.set(...wash.target);
      const spot = new THREE.SpotLight(
        wash.color,
        wash.intensity,
        wash.distance,
        wash.angle,
        wash.penumbra,
        wash.decay,
      );
      spot.name = 'war-room-v3-touch-hearth-wash';
      spot.castShadow = false;
      spot.target = target;
      hearthAnchor.add(spot);
      root.add(target);
      restores.push(() => {
        spot.removeFromParent();
        target.removeFromParent();
        spot.dispose?.();
      });
    }
  }

  // The shell is installed before it joins the scene; dim the shared fill once
  // it is parented, and put it back when the room goes away.
  const dimScene = () => {
    const scene = root.parent;
    if (!scene || root.userData.warRoomV3SceneFill) return;
    scene.children.forEach((node) => {
      if (!node.isHemisphereLight) return;
      const intensity = node.intensity;
      node.intensity *= WAR_ROOM_V3_SCENE_FILL.hemisphere[device];
      restores.push(() => { node.intensity = intensity; });
    });
    const envScale = WAR_ROOM_V3_SCENE_FILL.environment[device];
    if (envScale !== 1 && !Object.getOwnPropertyDescriptor(scene, 'environmentIntensity')?.get) {
      let raw = Number.isFinite(scene.environmentIntensity) ? scene.environmentIntensity : 1;
      Object.defineProperty(scene, 'environmentIntensity', {
        configurable: true,
        enumerable: true,
        get: () => raw * envScale,
        set: (value) => { raw = value; },
      });
      restores.push(() => {
        delete scene.environmentIntensity;
        scene.environmentIntensity = raw;
      });
    }
    root.userData.warRoomV3SceneFill = 'torchlit-v1';
  };
  if (!coarsePointer && root?.add) {
    const pool = WAR_ROOM_V3_BOARD_POOL;
    const spot = new THREE.SpotLight(pool.color, pool.intensity, 0, pool.angle, pool.penumbra, pool.decay);
    spot.name = 'war-room-v3-board-pool';
    spot.castShadow = false;
    spot.position.set(...pool.position);
    spot.target.position.set(...pool.target);
    root.add(spot, spot.target);
    restores.push(() => {
      spot.removeFromParent();
      spot.target.removeFromParent();
      spot.dispose?.();
    });
  }
  root?.addEventListener?.('added', dimScene);
  if (root?.parent) dimScene();
  if (root?.userData) root.userData.warRoomV3Lighting = 'torchlit-v1';
  return () => {
    root?.removeEventListener?.('added', dimScene);
    restores.reverse().forEach((restore) => restore());
    if (root?.userData) {
      delete root.userData.warRoomV3Lighting;
      delete root.userData.warRoomV3SceneFill;
    }
  };
}

const WAR_ROOM_V3 = createWarRoomBlenderVariantShell({
  variant: 'v3',
  runtimeModelUrl: WAR_ROOM_V3_RUNTIME_MODEL_URL,
  cacheBustBuild: false,
  rootName: 'war-room-v3-armory-hall-shell',
  runtimeFinish: 'gltf-pbr-armory-hall-v1',
  installRuntimeEffects: (root, { coarsePointer }) => {
    const releaseLighting = tuneWarRoomV3Lighting(root, { coarsePointer });
    const releaseTorches = installWarRoomV3Torches(root, { coarsePointer });
    const releaseFire = installWarRoomV3FireAnimation(root, {
      coarsePointer,
      spriteShape: WAR_ROOM_V3_HEARTH_FIRE_SHAPE,
    });
    return () => {
      releaseFire();
      releaseTorches();
      releaseLighting();
    };
  },
});

export const warRoomV3ModelUrl = WAR_ROOM_V3.modelUrl;
export const installWarRoomV3Shell = WAR_ROOM_V3.install;
