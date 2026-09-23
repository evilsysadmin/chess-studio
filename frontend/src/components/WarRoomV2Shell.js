import {
  WAR_ROOM_BLENDER_BOARD_ANCHOR_Y,
  configureWarRoomBlenderLoader,
  installWarRoomBlenderShell,
  scheduleWarRoomAfterFirstPaint,
  warRoomBlenderEnvMapIntensity,
  warRoomBlenderFabricSurfaceProfile,
  warRoomBlenderLeatherSurfaceProfile,
  warRoomBlenderMaterialFinishProfile,
  warRoomBlenderMetalSurfaceProfile,
  warRoomBlenderModelUrl,
  warRoomBlenderPracticalLightProfile,
  warRoomBlenderRuntimeSurfaceKind,
  warRoomBlenderStoneSurfaceProfile,
  warRoomBlenderWoodSurfaceProfile,
} from './WarRoomBlenderShellRuntime.js';

export const WAR_ROOM_V2_RUNTIME_MODEL_URL =
  'https://assets.chess-studio.shadowops.dpdns.org/war-room/v2/runtime/current.glb';
// Backward-compatible alias for callers/tests that still import the old name.
export const WAR_ROOM_V2_STAGING_MODEL_URL = WAR_ROOM_V2_RUNTIME_MODEL_URL;
export const WAR_ROOM_V2_BOARD_ANCHOR_Y = WAR_ROOM_BLENDER_BOARD_ANCHOR_Y;

export function warRoomV2ModelUrl({
  buildSha = import.meta.env.VITE_BUILD_SHA,
  baseUrl = WAR_ROOM_V2_RUNTIME_MODEL_URL,
} = {}) {
  return warRoomBlenderModelUrl({ buildSha, baseUrl });
}

export const configureWarRoomV2Loader = configureWarRoomBlenderLoader;
export const warRoomV2EnvMapIntensity = warRoomBlenderEnvMapIntensity;
export const warRoomV2MaterialFinishProfile = warRoomBlenderMaterialFinishProfile;
export const scheduleWarRoomV2AfterFirstPaint = scheduleWarRoomAfterFirstPaint;
export const warRoomV2PracticalLightProfile = warRoomBlenderPracticalLightProfile;
export const warRoomV2RuntimeSurfaceKind = warRoomBlenderRuntimeSurfaceKind;
export const warRoomV2StoneSurfaceProfile = warRoomBlenderStoneSurfaceProfile;
export const warRoomV2WoodSurfaceProfile = warRoomBlenderWoodSurfaceProfile;
export const warRoomV2MetalSurfaceProfile = warRoomBlenderMetalSurfaceProfile;
export const warRoomV2FabricSurfaceProfile = warRoomBlenderFabricSurfaceProfile;
export const warRoomV2LeatherSurfaceProfile = warRoomBlenderLeatherSurfaceProfile;

export function installWarRoomV2Shell(scene, options = {}) {
  return installWarRoomBlenderShell(scene, {
    ...options,
    url: options.url || warRoomV2ModelUrl(),
    variant: options.variant || 'v2',
    rootName: options.rootName || 'war-room-v2-blender-shell',
    runtimeFinish: options.runtimeFinish || 'gltf-pbr-cinematic-gothic-v11',
    boardAnchorY: options.boardAnchorY ?? WAR_ROOM_V2_BOARD_ANCHOR_Y,
  });
}
