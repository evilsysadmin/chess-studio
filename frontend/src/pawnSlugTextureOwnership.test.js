import { describe, expect, it, vi } from 'vitest';
import {
  PAWN_SLUG_TEXTURE_OWNERSHIP_META,
  pawnSlugShouldDisposePreviousTexture,
} from './pawnSlugTextureOwnership.js';

describe('Pawn Slug texture ownership', () => {
  it('disposes replaced non-generated textures', () => {
    const previous = { userData: {}, dispose: vi.fn() };
    const next = { userData: {} };
    expect(pawnSlugShouldDisposePreviousTexture(previous, next)).toBe(true);
  });

  it('keeps the generated soldier atlas without allocating an identity probe', () => {
    const previous = { userData: { pawnSlugSoldierAtlas: true }, dispose: vi.fn() };
    const next = { userData: {} };
    expect(pawnSlugShouldDisposePreviousTexture(previous, next)).toBe(false);
    expect(PAWN_SLUG_TEXTURE_OWNERSHIP_META.compareWithoutAllocation).toBe(true);
  });

  it('never disposes when there is no previous texture or it is unchanged', () => {
    const texture = { userData: {} };
    expect(pawnSlugShouldDisposePreviousTexture(null, texture)).toBe(false);
    expect(pawnSlugShouldDisposePreviousTexture(texture, texture)).toBe(false);
  });
});
