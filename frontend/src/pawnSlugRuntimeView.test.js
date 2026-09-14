import { describe, expect, it } from 'vitest';
import { PAWN_SLUG_VIEW_H, PAWN_SLUG_VIEW_W } from './pawnSlugRuntimeCore.js';
import {
  pawnSlugRespawnCameraX,
  pawnSlugSpawnRightEdge,
  pawnSlugViewportBounds,
} from './pawnSlugRuntimeView.js';

describe('Pawn Slug runtime viewport', () => {
  it('keeps the canonical world frame at the target aspect ratio', () => {
    const bounds = pawnSlugViewportBounds(2950, 1660);
    expect(bounds.left).toBeCloseTo(-PAWN_SLUG_VIEW_W / 2, 8);
    expect(bounds.right).toBeCloseTo(PAWN_SLUG_VIEW_W / 2, 8);
    expect(bounds.top).toBeCloseTo(PAWN_SLUG_VIEW_H / 2, 8);
    expect(bounds.bottom).toBeCloseTo(-PAWN_SLUG_VIEW_H / 2, 8);
  });

  it('reveals more horizontal world on wide hosts without stretching vertically', () => {
    const bounds = pawnSlugViewportBounds(2000, 1000);
    expect(Math.abs(bounds.left)).toBeGreaterThan(PAWN_SLUG_VIEW_W / 2);
    expect(bounds.right).toBeGreaterThan(PAWN_SLUG_VIEW_W / 2);
    expect(bounds.top).toBeCloseTo(PAWN_SLUG_VIEW_H / 2, 8);
    expect(bounds.bottom).toBeCloseTo(-PAWN_SLUG_VIEW_H / 2, 8);
  });

  it('reveals more vertical world on tall hosts without stretching horizontally', () => {
    const bounds = pawnSlugViewportBounds(1000, 2000);
    expect(bounds.left).toBeCloseTo(-PAWN_SLUG_VIEW_W / 2, 8);
    expect(bounds.right).toBeCloseTo(PAWN_SLUG_VIEW_W / 2, 8);
    expect(bounds.top).toBeGreaterThan(PAWN_SLUG_VIEW_H / 2);
    expect(Math.abs(bounds.bottom)).toBeGreaterThan(PAWN_SLUG_VIEW_H / 2);
  });

  it('clamps collapsed hosts to a finite one-pixel viewport', () => {
    const bounds = pawnSlugViewportBounds(0, 0);
    expect(bounds.width).toBe(1);
    expect(bounds.height).toBe(1);
    expect(Number.isFinite(bounds.left)).toBe(true);
    expect(Number.isFinite(bounds.top)).toBe(true);
  });

  it('keeps spawn-ahead geometry owned by the view instead of enemy code', () => {
    const cameraX = 42;
    const edge = pawnSlugSpawnRightEdge(cameraX);
    expect(edge).toBeCloseTo(cameraX + PAWN_SLUG_VIEW_W * 0.72, 8);
    expect(edge).toBeGreaterThan(cameraX);
    expect(pawnSlugSpawnRightEdge(Number.NaN)).toBeCloseTo(PAWN_SLUG_VIEW_W * 1.22, 8);
  });

  it('keeps respawn framing ahead of the player without crossing the world origin frame', () => {
    expect(pawnSlugRespawnCameraX(0)).toBeCloseTo(PAWN_SLUG_VIEW_W / 2, 8);
    expect(pawnSlugRespawnCameraX(80)).toBeCloseTo(80 + PAWN_SLUG_VIEW_W * 0.14, 8);
    expect(pawnSlugRespawnCameraX(Number.NaN)).toBeCloseTo(PAWN_SLUG_VIEW_W / 2, 8);
  });
});
