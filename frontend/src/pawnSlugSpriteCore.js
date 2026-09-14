// Stable Pawn Slug sprite boundary.
//
// Runtime consumers import sprite primitives from this module instead of
// coupling directly to pawnSlugSpritesLegacy.js. The legacy implementation
// stays behind this facade while it is decomposed incrementally.
export * from './pawnSlugSpritesLegacy.js';
