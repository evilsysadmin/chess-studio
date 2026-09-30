import { createWarRoomBlenderVariantShell } from './WarRoomBlenderShellRuntime.js';
import { installWarRoomV3FireAnimation } from './WarRoomV3Fire.js';
import { createWarRoomSideTorch } from './WarRoomMilitaryGallery.js';

export const WAR_ROOM_V3_RUNTIME_MODEL_URL =
  'https://assets.chess-studio.shadowops.dpdns.org/war-room/v3/runtime/current.glb';

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

export function installWarRoomV3Torches(root, { coarsePointer = false } = {}) {
  const anchors = [];
  root?.traverse?.((node) => {
    if (node.name?.startsWith(WAR_ROOM_V3_TORCH_ANCHOR_PREFIX)) anchors.push(node);
  });
  anchors.sort((a, b) => a.name.localeCompare(b.name));
  // Real point lights only on desktop; touch keeps the flame and wall halo.
  const torches = anchors.map((anchor, index) => {
    const torch = createWarRoomSideTorch({
      side: anchor.position.x < 0 ? -1 : 1,
      phase: 0.7 + index * 1.37,
      withLight: !coarsePointer,
    });
    torch.userData.warRoomV3Torch = anchor.name;
    anchor.add(torch);
    return torch;
  });
  if (root?.userData) root.userData.warRoomV3Torches = torches.length;
  return () => {
    torches.forEach((torch) => {
      torch.removeFromParent();
      torch.traverse((node) => {
        node.geometry?.dispose?.();
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        materials.forEach((material) => {
          material?.map?.dispose?.();
          material?.dispose?.();
        });
      });
    });
    if (root?.userData) delete root.userData.warRoomV3Torches;
  };
}

const WAR_ROOM_V3 = createWarRoomBlenderVariantShell({
  variant: 'v3',
  runtimeModelUrl: WAR_ROOM_V3_RUNTIME_MODEL_URL,
  rootName: 'war-room-v3-armory-hall-shell',
  runtimeFinish: 'gltf-pbr-armory-hall-v1',
  installRuntimeEffects: (root, { coarsePointer }) => {
    const releaseTorches = installWarRoomV3Torches(root, { coarsePointer });
    const releaseFire = installWarRoomV3FireAnimation(root, {
      coarsePointer,
      spriteShape: WAR_ROOM_V3_HEARTH_FIRE_SHAPE,
    });
    return () => {
      releaseFire();
      releaseTorches();
    };
  },
});

export const warRoomV3ModelUrl = WAR_ROOM_V3.modelUrl;
export const installWarRoomV3Shell = WAR_ROOM_V3.install;
