import { createWarRoomBlenderVariantShell } from './WarRoomBlenderShellRuntime.js';
import { warRoomVariantRuntimeModelUrl } from './WarRoomVariant.js';
import { installWarRoomV2FireSprites } from './WarRoomFireSprites.js';

// Use the same content-addressed GLB as the selector's intent prefetch. The
// legacy current.glb?build=... alias defeated browser/CDN caching every release.
export const WAR_ROOM_V2_RUNTIME_MODEL_URL = warRoomVariantRuntimeModelUrl('v2');

const WAR_ROOM_V2 = createWarRoomBlenderVariantShell({
  variant: 'v2',
  runtimeModelUrl: WAR_ROOM_V2_RUNTIME_MODEL_URL,
  rootName: 'war-room-v2-blender-shell',
  runtimeFinish: 'gltf-pbr-cinematic-gothic-v11',
  cacheBustBuild: false,
  installRuntimeEffects: (root, { coarsePointer }) => installWarRoomV2FireSprites(root, { coarsePointer }),
});

export const warRoomV2ModelUrl = WAR_ROOM_V2.modelUrl;
export const installWarRoomV2Shell = WAR_ROOM_V2.install;
