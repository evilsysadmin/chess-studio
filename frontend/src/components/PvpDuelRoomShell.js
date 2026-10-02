import * as THREE from 'three';
import { createWarRoomBlenderVariantShell } from './WarRoomBlenderShellRuntime.js';
import { PVP_DUEL_ROOM_RUNTIME_MODEL_URL } from './PvpDuelRoomAsset.js';

export { PVP_DUEL_ROOM_R2_ASSET_ID, PVP_DUEL_ROOM_RUNTIME_MODEL_URL } from './PvpDuelRoomAsset.js';

export function installPvpDuelRoomPracticalLights(root, { coarsePointer = false } = {}) {
  const specs = [
    ['PVP_ANCHOR_brazier_left', 0xff6a22, coarsePointer ? 0.82 : 1.48, 8.2],
    ['PVP_ANCHOR_brazier_right', 0xff6a22, coarsePointer ? 0.82 : 1.48, 8.2],
    ['PVP_ANCHOR_side_brazier_left', 0xff7a2a, coarsePointer ? 0.42 : 0.86, 7.0],
    ['PVP_ANCHOR_side_brazier_right', 0xff7a2a, coarsePointer ? 0.42 : 0.86, 7.0],
    ['PVP_ANCHOR_moon_fill', 0x6e91d8, coarsePointer ? 0.92 : 1.72, 12.5],
    ['PVP_ANCHOR_gate_depth', 0x5877b8, coarsePointer ? 0.18 : 0.38, 5.4],
    ['PVP_ANCHOR_player_fill', 0x8b96ad, coarsePointer ? 0.18 : 0.34, 8.8],
  ];
  const lights = [];

  for (const [anchorName, color, intensity, distance] of specs) {
    const anchor = root?.getObjectByName?.(anchorName);
    if (!anchor) continue;
    const light = new THREE.PointLight(color, intensity, distance, 2);
    light.name = `pvp-duel-room-practical-${anchorName}`;
    light.castShadow = false;
    light.userData.pvpDuelRoomPractical = anchorName;
    anchor.add(light);
    lights.push(light);
  }

  if (root?.userData) root.userData.pvpDuelRoomPracticalLights = lights.length;
  return () => {
    lights.forEach((light) => light.removeFromParent());
    if (root?.userData) root.userData.pvpDuelRoomPracticalLights = 0;
  };
}

const PVP_DUEL_ROOM = createWarRoomBlenderVariantShell({
  variant: 'duel',
  runtimeModelUrl: PVP_DUEL_ROOM_RUNTIME_MODEL_URL,
  rootName: 'pvp-duel-room-medieval-shell',
  runtimeFinish: 'gltf-pbr-pvp-teutonic-dungeon-v3',
  // This URL is content-addressed by the R2 manifest. Adding the frontend build SHA
  // only defeats browser/CDN reuse of the same ~8 MB GLB on every staging deploy.
  cacheBustBuild: false,
  installRuntimeEffects: installPvpDuelRoomPracticalLights,
});

export const pvpDuelRoomModelUrl = PVP_DUEL_ROOM.modelUrl;
export const installPvpDuelRoomShell = PVP_DUEL_ROOM.install;
