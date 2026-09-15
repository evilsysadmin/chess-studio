import { describe, expect, it } from 'vitest';
import matthiasMotionAtlasPayload from './assets/pawnSlug/matthias_motion_atlas_v5_payload.b64?raw';

describe('Pawn Slug Matthias motion atlas payload', () => {
  it('ships a complete 1536x480 WebP instead of mock bytes that force the two-frame fallback', () => {
    const bytes = Buffer.from(matthiasMotionAtlasPayload.trim(), 'base64');

    expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(bytes.subarray(8, 12).toString('ascii')).toBe('WEBP');
    expect(bytes.subarray(12, 16).toString('ascii')).toBe('VP8L');
    expect(bytes[20]).toBe(0x2f);
    expect(bytes.length).toBe(bytes.readUInt32LE(4) + 8);

    const dimensions = bytes.readUInt32LE(21);
    const width = 1 + (dimensions & 0x3fff);
    const height = 1 + ((dimensions >>> 14) & 0x3fff);
    expect({ width, height }).toEqual({ width: 1536, height: 480 });
  });
});
