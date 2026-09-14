export function pawnSlugShouldDisposePreviousTexture(previous, next) {
  if (!previous || previous === next) return false;
  if (previous.userData?.pawnSlugSoldierAtlas) return false;
  if (previous.userData?.pawnSlugPremiumEnemyRetained) return false;
  return true;
}

export const PAWN_SLUG_TEXTURE_OWNERSHIP_META = Object.freeze({
  generatedSoldierAtlasOwnedBySprite: true,
  premiumEnemyTextureProtectedFromLateFallback: true,
  compareWithoutAllocation: true,
});
