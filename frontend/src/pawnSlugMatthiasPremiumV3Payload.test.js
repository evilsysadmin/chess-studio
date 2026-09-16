import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import pistolPayload from './assets/pawnSlug/matthias_pistol_premium_v3.b64?raw';
import machinegunPayload from './assets/pawnSlug/matthias_machinegun_premium_v3.b64?raw';
import shotgunPayload from './assets/pawnSlug/matthias_shotgun_premium_v3.b64?raw';
import panzerfaustPayload from './assets/pawnSlug/matthias_panzerfaust_premium_v3.b64?raw';

const APPROVED_PAYLOADS = Object.freeze([
  Object.freeze({
    weapon: 'pistol',
    payload: pistolPayload,
    sha256: '3c816b297858e381198cdd27a56e7131e7f54534bbaaa86399c2dd06a2764926',
  }),
  Object.freeze({
    weapon: 'machinegun',
    payload: machinegunPayload,
    sha256: 'd0990d91ad3b48ffdbf24db438df60e16c9654b30b3162d63d77c2ff8f6a68b5',
  }),
  Object.freeze({
    weapon: 'shotgun',
    payload: shotgunPayload,
    sha256: 'bb1850e669f1f9b9eba32376417ffaec2e0b5469030aab24f5d780f31e81a2a2',
  }),
  Object.freeze({
    weapon: 'panzerfaust',
    payload: panzerfaustPayload,
    sha256: '19f4b689ff28f294a1e90527e6c3d6406b199c3c6b3ddf02b3e8c98f0d732ac1',
  }),
]);

function readUint24LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

describe('Pawn Slug Matthias premium v3 payloads', () => {
  it.each(APPROVED_PAYLOADS)('$weapon ships the approved 3072x960 alpha WebP', ({ payload, sha256 }) => {
    const bytes = Buffer.from(payload.trim(), 'base64');

    expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(bytes.subarray(8, 12).toString('ascii')).toBe('WEBP');
    expect(bytes.subarray(12, 16).toString('ascii')).toBe('VP8X');
    expect(bytes.length).toBe(bytes.readUInt32LE(4) + 8);
    expect(bytes[20] & 0x10).toBe(0x10);

    const width = 1 + readUint24LE(bytes, 24);
    const height = 1 + readUint24LE(bytes, 27);
    expect({ width, height }).toEqual({ width: 3072, height: 960 });
    expect(bytes.length).toBeGreaterThan(200_000);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(sha256);
  });
});
