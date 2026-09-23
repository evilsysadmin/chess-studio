import { createWarRoomBlenderVariantShell } from './WarRoomBlenderShellRuntime.js';

export const WAR_ROOM_V3_RUNTIME_MODEL_URL =
  'https://assets.chess-studio.shadowops.dpdns.org/war-room/v3/runtime/current.glb';

const WAR_ROOM_V3 = createWarRoomBlenderVariantShell({
  variant: 'v3',
  runtimeModelUrl: WAR_ROOM_V3_RUNTIME_MODEL_URL,
  rootName: 'war-room-v3-celestial-observatory-shell',
  runtimeFinish: 'gltf-pbr-celestial-observatory-v1',
});

export const warRoomV3ModelUrl = WAR_ROOM_V3.modelUrl;
export const installWarRoomV3Shell = WAR_ROOM_V3.install;
