import { createWarRoomBlenderVariantShell } from './WarRoomBlenderShellRuntime.js';
import { installWarRoomV3FireAnimation } from './WarRoomV3Fire.js';

export const WAR_ROOM_V4_RUNTIME_MODEL_URL =
  'https://assets.chess-studio.shadowops.dpdns.org/war-room/v4/runtime/current.glb';

// Fireplace flames authored by scripts/blender/build_war_room_v4.py (validated
// as runtime nodes there); they reuse the proven v3 flicker + sprite driver.
export const WAR_ROOM_V4_FLAME_NAMES = Object.freeze([
  'WR4_OBS_fireplace_flame_body',
  'WR4_OBS_fireplace_flame_0',
  'WR4_OBS_fireplace_flame_1',
  'WR4_OBS_fireplace_flame_2',
]);

// The golden is warmer than v2/v3. Boost the practicals the shared shell
// already installs (no extra lights, so no extra shader cost); mobile keeps its
// lighter profile because its lantern practical is not installed at all.
export const WAR_ROOM_V4_PRACTICAL_BOOSTS = Object.freeze({
  'war-room-blender-chandelier-practical': Object.freeze({ intensity: 2.1, distance: 1.5 }),
  'war-room-blender-fire-practical': Object.freeze({ intensity: 1.2, distance: 1.15 }),
});

export function tuneWarRoomV4PracticalLights(root) {
  const touched = [];
  root?.traverse?.((node) => {
    const boost = WAR_ROOM_V4_PRACTICAL_BOOSTS[node.name];
    if (!node.isPointLight || !boost) return;
    touched.push([node, node.intensity, node.distance]);
    node.intensity *= boost.intensity;
    node.distance *= boost.distance;
  });
  if (root?.userData) root.userData.warRoomV4Lighting = touched.length ? 'warm-practicals-v1' : 'none';
  return () => {
    touched.forEach(([node, intensity, distance]) => {
      node.intensity = intensity;
      node.distance = distance;
    });
    if (root?.userData) delete root.userData.warRoomV4Lighting;
  };
}

const WAR_ROOM_V4 = createWarRoomBlenderVariantShell({
  variant: 'v4',
  runtimeModelUrl: WAR_ROOM_V4_RUNTIME_MODEL_URL,
  rootName: 'war-room-v4-moonlit-royal-observatory-shell',
  runtimeFinish: 'gltf-pbr-moonlit-royal-observatory-v1',
  installRuntimeEffects: (root, { coarsePointer }) => {
    // Tune first so the fire flicker takes the boosted intensity as its base.
    const releaseLighting = tuneWarRoomV4PracticalLights(root);
    const releaseFire = installWarRoomV3FireAnimation(root, { coarsePointer, flameNames: WAR_ROOM_V4_FLAME_NAMES });
    return () => {
      releaseFire();
      releaseLighting();
    };
  },
});

export const warRoomV4ModelUrl = WAR_ROOM_V4.modelUrl;
export const installWarRoomV4Shell = WAR_ROOM_V4.install;
