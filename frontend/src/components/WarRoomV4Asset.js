import { r2AssetUrl } from '../r2Assets.js';

// The manifest pins the exact audited V4 GLB, including Hans' dynamic door
// and authored stage. The immutable R2 bytes are verified by the V4 pin gate.
// Both intent prefetch and the installer use this single logical asset ID.
export const WAR_ROOM_V4_RUNTIME_ASSET_URL = r2AssetUrl('warRoom.v4.runtime');
