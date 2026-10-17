import { r2AssetUrl } from '../r2Assets.js';

// The manifest points to an immutable clone of the exact live #5721 GLB,
// including Hans' authored stage. Both intent prefetch and the installer
// consume this constant; never restore the older stale manifest generation.
export const WAR_ROOM_V4_RUNTIME_ASSET_URL = r2AssetUrl('warRoom.v4.runtime');
