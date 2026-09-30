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

const WAR_ROOM_V4 = createWarRoomBlenderVariantShell({
  variant: 'v4',
  runtimeModelUrl: WAR_ROOM_V4_RUNTIME_MODEL_URL,
  rootName: 'war-room-v4-moonlit-royal-observatory-shell',
  runtimeFinish: 'gltf-pbr-moonlit-royal-observatory-v1',
  installRuntimeEffects: (root, { coarsePointer }) => (
    installWarRoomV3FireAnimation(root, { coarsePointer, flameNames: WAR_ROOM_V4_FLAME_NAMES })
  ),
});

export const warRoomV4ModelUrl = WAR_ROOM_V4.modelUrl;
export const installWarRoomV4Shell = WAR_ROOM_V4.install;
