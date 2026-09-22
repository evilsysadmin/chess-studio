import { describe, expect, it } from 'vitest';
import {
  WAR_ROOM_V3_RUNTIME_MODEL_URL,
  WAR_ROOM_V3_STAGING_MODEL_URL,
  warRoomV3ModelUrl,
} from './WarRoomV3Shell.js';

describe('War Room v3 runtime asset URL', () => {
  it('owns a stable runtime alias separate from v2', () => {
    expect(WAR_ROOM_V3_RUNTIME_MODEL_URL).toContain('/war-room/v3/runtime/current.glb');
    expect(WAR_ROOM_V3_STAGING_MODEL_URL).toBe(WAR_ROOM_V3_RUNTIME_MODEL_URL);
    expect(warRoomV3ModelUrl({ buildSha: 'abc123' }))
      .toBe(`${WAR_ROOM_V3_RUNTIME_MODEL_URL}?build=abc123`);
  });

  it('keeps explicit query parameters and encodes the build token', () => {
    expect(warRoomV3ModelUrl({
      buildSha: 'main/abc 123',
      baseUrl: 'https://assets.example.test/current.glb?source=staging',
    })).toBe('https://assets.example.test/current.glb?source=staging&build=main%2Fabc%20123');
  });
});
