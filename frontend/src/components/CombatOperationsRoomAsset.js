import { r2AssetUrl } from '../r2Assets.js';

export const COMBAT_OPERATIONS_ROOM_R2_ASSET_ID = 'combat.operationsRoom.runtime';

export const COMBAT_OPERATIONS_ROOM_LEGACY_RUNTIME_MODEL_URL =
  'https://assets.chess-studio.shadowops.dpdns.org/combat/operations-room/runtime/current.glb';

export const COMBAT_OPERATIONS_ROOM_RUNTIME_MODEL_URL = r2AssetUrl(
  COMBAT_OPERATIONS_ROOM_R2_ASSET_ID,
  COMBAT_OPERATIONS_ROOM_LEGACY_RUNTIME_MODEL_URL,
);
