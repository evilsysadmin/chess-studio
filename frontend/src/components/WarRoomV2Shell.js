import { createWarRoomBlenderVariantShell } from './WarRoomBlenderShellRuntime.js';

export const WAR_ROOM_V2_RUNTIME_MODEL_URL =
  'https://assets.chess-studio.shadowops.dpdns.org/war-room/v2/runtime/current.glb';

const WAR_ROOM_V2 = createWarRoomBlenderVariantShell({
  variant: 'v2',
  runtimeModelUrl: WAR_ROOM_V2_RUNTIME_MODEL_URL,
  rootName: 'war-room-v2-blender-shell',
  runtimeFinish: 'gltf-pbr-cinematic-gothic-v11',
});

export const warRoomV2ModelUrl = WAR_ROOM_V2.modelUrl;
export const installWarRoomV2Shell = WAR_ROOM_V2.install;
