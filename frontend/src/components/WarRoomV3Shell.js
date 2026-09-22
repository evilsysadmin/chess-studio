import { installWarRoomV2Shell } from './WarRoomV2Shell.js';

export const WAR_ROOM_V3_RUNTIME_MODEL_URL =
  'https://assets.chess-studio.shadowops.dpdns.org/war-room/v3/runtime/current.glb';
export const WAR_ROOM_V3_STAGING_MODEL_URL = WAR_ROOM_V3_RUNTIME_MODEL_URL;

export function warRoomV3ModelUrl({
  buildSha = import.meta.env.VITE_BUILD_SHA,
  baseUrl = WAR_ROOM_V3_RUNTIME_MODEL_URL,
} = {}) {
  const version = String(buildSha || '').trim();
  if (!version) return baseUrl;
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}build=${encodeURIComponent(version)}`;
}

export function installWarRoomV3Shell(
  scene,
  {
    whiteSide = true,
    coarsePointer = false,
    url = warRoomV3ModelUrl(),
    onRefine,
  } = {},
) {
  return installWarRoomV2Shell(scene, {
    whiteSide,
    coarsePointer,
    url,
    onRefine,
    variant: 'v3',
    rootName: 'war-room-v3-cartographers-shell',
    runtimeFinish: 'gltf-pbr-cartographers-v1',
  });
}
