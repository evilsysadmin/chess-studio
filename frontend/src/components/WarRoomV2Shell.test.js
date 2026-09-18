import { describe, expect, it } from 'vitest';
import {
  WAR_ROOM_V2_STAGING_MODEL_URL,
  warRoomV2EnvMapIntensity,
  warRoomV2ModelUrl,
  warRoomV2PracticalLightProfile,
  warRoomV2RuntimeSurfaceKind,
  warRoomV2StoneSurfaceProfile,
} from './WarRoomV2Shell.js';
import { shouldShowClassicWarRoomShell } from './WarRoomSceneVariant.js';

describe('War Room v2 staging asset URL', () => {
  it('never paints classic first when persisted v2 is available', () => {
    expect(shouldShowClassicWarRoomShell()).toBe(true);
    expect(shouldShowClassicWarRoomShell({ selectable: true, variant: 'v2' })).toBe(false);
    expect(shouldShowClassicWarRoomShell({ selectable: true, variant: 'classic' })).toBe(true);
    expect(shouldShowClassicWarRoomShell({ selectable: false, variant: 'v2' })).toBe(true);
  });

  it('keeps authored practicals cinematic and cheaper on coarse pointers', () => {
    const desktop = warRoomV2PracticalLightProfile();
    const coarse = warRoomV2PracticalLightProfile({ coarsePointer: true });
    expect(desktop.fire.color).toBe(0xff8a38);
    expect(desktop.moon.color).toBe(0x6f98ff);
    expect(desktop.fire.intensity).toBeGreaterThan(coarse.fire.intensity);
    expect(desktop.moon.intensity).toBeGreaterThan(coarse.moon.intensity);
    expect(desktop.fire.distance).toBeLessThan(desktop.moon.distance);
    expect(desktop.fire.intensity).toBe(2.45);
    expect(desktop.fire.distance).toBe(11.3);
    expect(desktop.moon.intensity).toBe(2.95);
    expect(desktop.moon.distance).toBe(13.9);
  });

  it('keeps nocturnal materials below the old bright IBL levels', () => {
    expect(warRoomV2EnvMapIntensity('WR_MAT_wall_walnut')).toBe(0.32);
    expect(warRoomV2EnvMapIntensity('WR_MAT_stone')).toBe(0.20);
    expect(warRoomV2EnvMapIntensity('WR_MAT_rug')).toBe(0.16);
    expect(warRoomV2EnvMapIntensity('WR_MAT_armor')).toBe(0.88);
  });

  it('adds desktop-only microdetail to the authored stone family', () => {
    expect(warRoomV2RuntimeSurfaceKind('WR_MAT_wall_plaster')).toBe('stone');
    expect(warRoomV2RuntimeSurfaceKind('WR_MAT_floor_underlay')).toBe('stone');
    expect(warRoomV2RuntimeSurfaceKind('WR_MAT_stone_light')).toBe('stone');
    expect(warRoomV2RuntimeSurfaceKind('WR_MAT_wall_walnut')).toBe(null);

    expect(warRoomV2StoneSurfaceProfile()).toEqual({
      enabled: true,
      size: 32,
      bumpScale: 0.012,
      albedoCompensation: 1.10,
    });
    expect(warRoomV2StoneSurfaceProfile({ coarsePointer: true })).toEqual({
      enabled: false,
      size: 0,
      bumpScale: 0,
      albedoCompensation: 1,
    });
  });

  it('versions the mutable current.glb alias with the frontend build SHA', () => {
    expect(warRoomV2ModelUrl({ buildSha: 'abc123' }))
      .toBe(`${WAR_ROOM_V2_STAGING_MODEL_URL}?build=abc123`);
  });

  it('keeps explicit query parameters intact and encodes the build token', () => {
    expect(warRoomV2ModelUrl({
      buildSha: 'main/abc 123',
      baseUrl: 'https://assets.example.test/current.glb?source=staging',
    })).toBe('https://assets.example.test/current.glb?source=staging&build=main%2Fabc%20123');
  });

  it('falls back to the bare alias only when no build SHA exists', () => {
    expect(warRoomV2ModelUrl({ buildSha: '' })).toBe(WAR_ROOM_V2_STAGING_MODEL_URL);
  });
});
