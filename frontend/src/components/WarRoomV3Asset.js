import { r2AssetUrl } from '../r2Assets.js';

// The manifest pins the visual-reviewed immutable V3 GLB with Hans' stage.
// Both intent prefetch and installer consume this same content-addressed URL;
// never resolve the mutable R2 alias during a production game.
export const WAR_ROOM_V3_RUNTIME_ASSET_URL = r2AssetUrl('warRoom.v3.runtime');
