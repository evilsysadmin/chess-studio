const PISTOL_ATLAS_URL = 'https://assets.chess-studio.shadowops.dpdns.org/pawn-slug/matthias/pistol/matthias_pistol_canonical_v4-8d06b70e1ea9ce27.webp';

export const PAWN_SLUG_CANONICAL_HANDOFF = Object.freeze({
  version: 'canonical-pistol-v4',
  atlasSha256: '8d06b70e1ea9ce2735c8e9b01d5952022770fc4d355f49f3c683986287b7b259',
  atlasBytes: 515130,
  width: 3072,
  height: 960,
  frameWidth: 192,
  frameHeight: 192,
  guardTexels: 2,
  footAnchorPx: 24,
  sourceFacing: 'left',
  weapon: 'pistol',
  actions: Object.freeze({
    idle: Object.freeze({ row: 0, count: 10 }),
    walk: Object.freeze({ row: 1, count: 10 }),
    run: Object.freeze({ row: 2, count: 16 }),
    crouch: Object.freeze({ row: 3, count: 10 }),
    jump: Object.freeze({ row: 4, count: 9 }),
  }),
});

// Immutable R2 fallback for builds whose logical manifest is temporarily stale.
// The old 4-column Git blob is deliberately not used with the 16x5 v4 contract.
export const pawnSlugCanonicalPistolAtlasUrl = PISTOL_ATLAS_URL;

export function pawnSlugCanonicalPistolWindow(action = 'idle', frameIndex = 0, direction = 1) {
  const metadata = PAWN_SLUG_CANONICAL_HANDOFF;
  const safeAction = Object.hasOwn(metadata.actions, action) ? action : 'idle';
  const { row, count } = metadata.actions[safeAction];
  const index = Number.isFinite(frameIndex) ? Math.floor(frameIndex) : 0;
  const frame = ((index % count) + count) % count;
  const { width, height, frameWidth, frameHeight, guardTexels: guard } = metadata;
  const mirrored = direction >= 0;
  return {
    action: safeAction,
    row,
    frameIndex: frame,
    mirrored,
    repeatX: (mirrored ? -1 : 1) * (frameWidth - 2 * guard) / width,
    repeatY: (frameHeight - 2 * guard) / height,
    offsetX: (frame * frameWidth + (mirrored ? frameWidth - guard : guard)) / width,
    offsetY: (height - (row + 1) * frameHeight + guard) / height,
  };
}
