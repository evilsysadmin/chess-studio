import {
  WAR_ROOM_BLENDER_BOARD_ANCHOR_Y,
  installWarRoomBlenderShell,
  warRoomBlenderModelUrl,
} from './WarRoomBlenderShellRuntime.js';

export const WAR_ROOM_V2_RUNTIME_MODEL_URL =
  'https://assets.chess-studio.shadowops.dpdns.org/war-room/v2/runtime/current.glb';

export function warRoomV2ModelUrl({
  buildSha = import.meta.env.VITE_BUILD_SHA,
  baseUrl = WAR_ROOM_V2_RUNTIME_MODEL_URL,
} = {}) {
  return warRoomBlenderModelUrl({ buildSha, baseUrl });
}

export function installWarRoomV2Shell(scene, options = {}) {
  return installWarRoomBlenderShell(scene, {
    ...options,
    url: options.url || warRoomV2ModelUrl(),
    variant: 'v2',
    rootName: 'war-room-v2-blender-shell',
    runtimeFinish: 'gltf-pbr-cinematic-gothic-v11',
    boardAnchorY: options.boardAnchorY ?? WAR_ROOM_BLENDER_BOARD_ANCHOR_Y,
  });
}
