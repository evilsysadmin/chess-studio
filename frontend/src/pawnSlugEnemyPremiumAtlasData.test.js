import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_PREMIUM_ENEMY_RASTER_BASE64,
  PAWN_SLUG_PREMIUM_ENEMY_RASTER_BYTE_LENGTH,
  PAWN_SLUG_PREMIUM_ENEMY_RASTER_DATA_URL,
  PAWN_SLUG_PREMIUM_ENEMY_RASTER_SHA256,
} from './pawnSlugEnemyPremiumAtlasData.js';

describe('Pawn Slug premium enemy atlas transport integrity', () => {
  it('reconstructs the complete authored WebP byte-for-byte', () => {
    const bytes = Buffer.from(PAWN_SLUG_PREMIUM_ENEMY_RASTER_BASE64, 'base64');
    expect(bytes.length).toBe(PAWN_SLUG_PREMIUM_ENEMY_RASTER_BYTE_LENGTH);
    expect(bytes.readUInt32LE(4) + 8).toBe(bytes.length);
    expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(bytes.subarray(8, 12).toString('ascii')).toBe('WEBP');
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(PAWN_SLUG_PREMIUM_ENEMY_RASTER_SHA256);
    expect(PAWN_SLUG_PREMIUM_ENEMY_RASTER_DATA_URL).toMatch(/^data:image\/webp;base64,/);
  });
});