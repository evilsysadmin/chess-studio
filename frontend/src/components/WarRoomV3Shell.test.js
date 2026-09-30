import { describe, expect, it } from 'vitest';
import {
  WAR_ROOM_V3_HEARTH_FIRE_SHAPE,
  WAR_ROOM_V3_RUNTIME_MODEL_URL,
  warRoomV3ModelUrl,
} from './WarRoomV3Shell.js';

describe('War Room v3 runtime asset URL', () => {
  it('owns a stable runtime alias separate from v2', () => {
    expect(WAR_ROOM_V3_RUNTIME_MODEL_URL).toContain('/war-room/v3/runtime/current.glb');
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

describe('War Room v3 armory hearth fire', () => {
  it('burns wider and taller than the retired observatory stove', () => {
    expect(WAR_ROOM_V3_HEARTH_FIRE_SHAPE.spreadX).toBeGreaterThan(0.3);
    expect(WAR_ROOM_V3_HEARTH_FIRE_SHAPE.height).toBeGreaterThan(0.55);
  });
});
