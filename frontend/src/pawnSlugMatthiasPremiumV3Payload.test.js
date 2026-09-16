import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import pistolPayload from './assets/pawnSlug/matthias_pistol_premium_v3.b64?raw';
import machinegunPayload from './assets/pawnSlug/matthias_machinegun_premium_v3.b64?raw';
import shotgunPayload from './assets/pawnSlug/matthias_shotgun_premium_v3.b64?raw';
import panzerfaustPayload from './assets/pawnSlug/matthias_panzerfaust_premium_v3.b64?raw';

const APPROVED_PAYLOADS = Object.freeze([
  Object.freeze({ weapon: 'pistol', payload: pistolPayload, sha256: '38753f9a6f8a890e60661af81aed171a76a03ef23191f889ab772a8a75351993' }),
  Object.freeze({ weapon: 'machinegun', payload: machinegunPayload, sha256: 'a83a25d9b8c424c16414396bb165d3985b466b009b4cd6936e3835317be01250' }),
  Object.freeze({ weapon: 'shotgun', payload: shotgunPayload, sha256: '35fc4f24fad32f10bf26e24c85dee37b163edd1aac54794c491cb5e6836882e9' }),
  Object.freeze({ weapon: 'panzerfaust', payload: panzerfaustPayload, sha256: '029dbf486570749df9eaccc68f37d3c1061b470513dc074915d987d09d438e67' }),
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
