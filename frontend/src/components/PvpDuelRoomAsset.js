import { r2AssetUrl } from '../r2Assets.js';

export const PVP_DUEL_ROOM_R2_ASSET_ID = 'pvp.duelRoom.runtime';

export const PVP_DUEL_ROOM_LEGACY_RUNTIME_MODEL_URL =
  'https://assets.chess-studio.shadowops.dpdns.org/pvp/duel-room/runtime/current.glb';

export const PVP_DUEL_ROOM_RUNTIME_MODEL_URL = r2AssetUrl(
  PVP_DUEL_ROOM_R2_ASSET_ID,
  PVP_DUEL_ROOM_LEGACY_RUNTIME_MODEL_URL,
);
