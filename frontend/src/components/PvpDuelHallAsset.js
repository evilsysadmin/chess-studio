import { r2AssetUrl } from '../r2Assets.js';

export const PVP_DUEL_HALL_R2_ASSET_ID = 'pvp.duelHall.runtime';

export const PVP_DUEL_HALL_LEGACY_RUNTIME_MODEL_URL =
  'https://assets.chess-studio.shadowops.dpdns.org/pvp/duel-hall/runtime/current.glb';

export const PVP_DUEL_HALL_RUNTIME_MODEL_URL = r2AssetUrl(
  PVP_DUEL_HALL_R2_ASSET_ID,
  PVP_DUEL_HALL_LEGACY_RUNTIME_MODEL_URL,
);
