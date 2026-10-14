import { describe, expect, it } from 'vitest';
import { warRoomVariantRuntimeModelUrl } from './WarRoomVariant.js';
import {
  WAR_ROOM_V2_RUNTIME_MODEL_URL,
  warRoomV2ModelUrl,
} from './WarRoomV2Shell.js';

describe('War Room v2 runtime asset URL', () => {
  it('uses the exact content-addressed GLB that intent prefetch warms', () => {
    const expected = warRoomVariantRuntimeModelUrl('v2', { buildSha: 'abc123' });
    expect(expected).toContain('/war-room/v2/runtime/war-room-premium-shell-');
    expect(WAR_ROOM_V2_RUNTIME_MODEL_URL).toBe(expected);
    expect(warRoomV2ModelUrl({ buildSha: 'abc123' })).toBe(expected);
    expect(warRoomV2ModelUrl({ buildSha: 'another-release' })).toBe(expected);
    expect(warRoomV2ModelUrl({ buildSha: '' })).toBe(expected);
  });

  it('does not append a frontend build SHA to an explicit versioned asset URL', () => {
    const url = 'https://assets.example.test/war-room/v2/runtime/shell-0123456789abcdef.glb?source=staging';
    expect(warRoomV2ModelUrl({ buildSha: 'main/abc 123', baseUrl: url })).toBe(url);
  });
});
