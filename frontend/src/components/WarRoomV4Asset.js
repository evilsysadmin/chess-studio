// The live V4 alias is not byte-identical to the older content-addressed R2
// manifest asset. Preserve the current authored scene until it is published
// under its own immutable, verified release URL. Both intent preload and the
// Blender installer must request this same alias + frontend build token.
export const WAR_ROOM_V4_RUNTIME_ALIAS_URL =
  'https://assets.chess-studio.shadowops.dpdns.org/war-room/v4/runtime/current.glb';
