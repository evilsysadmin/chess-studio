import { createWarRoomBlenderVariantShell } from './WarRoomBlenderShellRuntime.js';

export const PVP_DUEL_ROOM_RUNTIME_MODEL_URL =
  'https://assets.chess-studio.shadowops.dpdns.org/pvp/duel-room/runtime/current.glb';

const PVP_DUEL_ROOM = createWarRoomBlenderVariantShell({
  variant: 'duel',
  runtimeModelUrl: PVP_DUEL_ROOM_RUNTIME_MODEL_URL,
  rootName: 'pvp-duel-room-medieval-shell',
  runtimeFinish: 'gltf-pbr-pvp-medieval-duel-v1',
});

export const pvpDuelRoomModelUrl = PVP_DUEL_ROOM.modelUrl;
export const installPvpDuelRoomShell = PVP_DUEL_ROOM.install;
