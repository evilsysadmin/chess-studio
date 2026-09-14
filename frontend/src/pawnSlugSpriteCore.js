// Stable Pawn Slug sprite boundary.
//
// New runtime consumers import shared sprite primitives from this module instead
// of coupling directly to pawnSlugSpritesLegacy.js. The legacy implementation
// remains behind this facade while it is decomposed incrementally.
export {
  PAWN_SLUG_MOTION_PROFILES,
  configurePawnSlugTexture,
} from './pawnSlugSpritesLegacy.js';
