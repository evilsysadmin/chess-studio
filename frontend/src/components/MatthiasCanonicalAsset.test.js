import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const EXPECTED_SHA256 = '88bebc7e44293093bd83fec0fd4a11b2f23d6cbf0d2e59fcb4ffc6ff293facec';
const EXPECTED_WIDTH = 192;
const EXPECTED_HEIGHT = 256;

function uint24le(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

describe('Matthias canonical Home asset', () => {
  it('bloquea los bytes y dimensiones del mock aprobado', () => {
    const payload = readFileSync(
      new URL('../../public/matthias-home-canonical.b64', import.meta.url),
      'utf8',
    ).trim();
    const bytes = Buffer.from(payload, 'base64');

    expect(payload.startsWith('UklG')).toBe(true);
    expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(bytes.subarray(8, 12).toString('ascii')).toBe('WEBP');
    expect(bytes.subarray(12, 16).toString('ascii')).toBe('VP8X');
    expect(uint24le(bytes, 24) + 1).toBe(EXPECTED_WIDTH);
    expect(uint24le(bytes, 27) + 1).toBe(EXPECTED_HEIGHT);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(EXPECTED_SHA256);
  });
});
