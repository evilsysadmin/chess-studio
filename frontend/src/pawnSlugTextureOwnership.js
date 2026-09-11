export function pawnSlugShouldDisposePreviousTexture(previous, next) {
  if (!previous || previous === next) return false;
  return !Boolean(previous.userData?.pawnSlugSoldierAtlas);
}

export const PAWN_SLUG_TEXTURE_OWNERSHIP_META = Object.freeze({
  generatedSoldierAtlasOwnedBySprite: true,
  compareWithoutAllocation: true,
});
