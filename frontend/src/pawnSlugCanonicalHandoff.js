import bundledAtlasUrl from './assets/pawnSlug/matthias_canonical_pistol_v1.webp';
import metadata from './assets/pawnSlug/matthias_canonical_pistol_v1.json';
import { r2AssetUrl } from './r2Assets.js';

export const PAWN_SLUG_CANONICAL_HANDOFF = Object.freeze(metadata);
export const pawnSlugCanonicalPistolFallbackAtlasUrl = bundledAtlasUrl;
export const pawnSlugCanonicalPistolAtlasUrl = r2AssetUrl(
  'pawnSlug.matthias.pistol',
  pawnSlugCanonicalPistolFallbackAtlasUrl,
);

export function pawnSlugCanonicalPistolWindow(action = 'idle', frameIndex = 0, direction = 1) {
  const safeAction = Object.hasOwn(metadata.actions, action) ? action : 'idle';
  const { row, count } = metadata.actions[safeAction];
  const index = Number.isFinite(frameIndex) ? Math.floor(frameIndex) : 0;
  const frame = ((index % count) + count) % count;
  const { width, height, frameWidth, frameHeight, guardTexels: guard } = metadata;
  const mirrored = direction < 0;
  return {
    action: safeAction, row, frameIndex: frame, mirrored,
    repeatX: (mirrored ? -1 : 1) * (frameWidth - 2 * guard) / width,
    repeatY: (frameHeight - 2 * guard) / height,
    offsetX: (frame * frameWidth + (mirrored ? frameWidth - guard : guard)) / width,
    offsetY: (height - (row + 1) * frameHeight + guard) / height,
  };
}
