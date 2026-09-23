import {
  WAR_ROOM_BLENDER_BOARD_ANCHOR_Y,
  installWarRoomBlenderShell,
  warRoomBlenderModelUrl,
} from './WarRoomBlenderShellRuntime.js';

export const WAR_ROOM_V3_RUNTIME_MODEL_URL =
  'https://assets.chess-studio.shadowops.dpdns.org/war-room/v3/runtime/current.glb';

export function warRoomV3ModelUrl({
  buildSha = import.meta.env.VITE_BUILD_SHA,
  baseUrl = WAR_ROOM_V3_RUNTIME_MODEL_URL,
} = {}) {
  return warRoomBlenderModelUrl({ buildSha, baseUrl });
}

export function installWarRoomV3Shell(scene, options = {}) {
  return installWarRoomBlenderShell(scene, {
    ...options,
    url: options.url || warRoomV3ModelUrl(),
    variant: 'v3',
    rootName: 'war-room-v3-celestial-observatory-shell',
    runtimeFinish: 'gltf-pbr-celestial-observatory-v1',
    boardAnchorY: options.boardAnchorY ?? WAR_ROOM_BLENDER_BOARD_ANCHOR_Y,
  });
}
