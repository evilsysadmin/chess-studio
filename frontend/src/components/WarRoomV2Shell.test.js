import { describe, expect, it } from 'vitest';
import {
  WAR_ROOM_V2_STAGING_MODEL_URL,
  configureWarRoomV2Loader,
  warRoomV2EnvMapIntensity,
  warRoomV2MaterialFinishProfile,
  warRoomV2ModelUrl,
  scheduleWarRoomV2AfterFirstPaint,
  warRoomV2PracticalLightProfile,
  warRoomV2RuntimeSurfaceKind,
  warRoomV2StoneSurfaceProfile,
  warRoomV2WoodSurfaceProfile,
} from './WarRoomV2Shell.js';
import {
  createWarRoomClassicShellController,
  shouldShowClassicWarRoomShell,
} from './WarRoomSceneVariant.js';

describe('War Room v2 staging asset URL', () => {
  it('registers the bundled Meshopt decoder on the v2 GLTF loader', () => {
    let decoder = null;
    const loader = {
      setMeshoptDecoder(value) {
        decoder = value;
        return this;
      },
    };

    expect(configureWarRoomV2Loader(loader)).toBe(loader);
    expect(decoder).toBeTruthy();
    expect(decoder.ready).toBeTruthy();
  });

  it('never paints classic first when persisted v2 is available', () => {
    expect(shouldShowClassicWarRoomShell()).toBe(true);
    expect(shouldShowClassicWarRoomShell({ selectable: true, variant: 'v2' })).toBe(false);
    expect(shouldShowClassicWarRoomShell({ selectable: true, variant: 'classic' })).toBe(true);
    expect(shouldShowClassicWarRoomShell({ selectable: false, variant: 'v2' })).toBe(true);
  });

  it('does not construct the classic room for persisted v2 until fallback needs it', () => {
    let builds = 0;
    const shell = { name: 'classic-shell' };
    const controller = createWarRoomClassicShellController({
      eager: false,
      build: () => {
        builds += 1;
        return [shell];
      },
    });

    expect(controller.isBuilt()).toBe(false);
    expect(controller.current()).toEqual([]);
    expect(builds).toBe(0);

    expect(controller.ensure()).toEqual([shell]);
    expect(controller.ensure()).toEqual([shell]);
    expect(controller.isBuilt()).toBe(true);
    expect(builds).toBe(1);
  });

  it('keeps classic eager behavior when the classic variant is actually active', () => {
    let builds = 0;
    const controller = createWarRoomClassicShellController({
      eager: true,
      build: () => {
        builds += 1;
        return [{ name: 'classic-shell' }];
      },
    });

    expect(controller.isBuilt()).toBe(true);
    expect(controller.current()).toHaveLength(1);
    expect(builds).toBe(1);
  });

  it('defers expensive shell refinement until after a paint and an idle turn', () => {
    let frame = null;
    let idle = null;
    let refinements = 0;
    const cancelled = [];
    const release = scheduleWarRoomV2AfterFirstPaint(
      () => { refinements += 1; },
      {
        requestFrame: (callback) => {
          frame = callback;
          return 11;
        },
        cancelFrame: (id) => cancelled.push(['frame', id]),
        requestIdle: (callback) => {
          idle = callback;
          return 22;
        },
        cancelIdle: (id) => cancelled.push(['idle', id]),
        setTimer: () => {
          throw new Error('timer fallback should not be used');
        },
      },
    );

    expect(refinements).toBe(0);
    frame();
    expect(refinements).toBe(0);
    idle();
    expect(refinements).toBe(1);
    release();
    expect(cancelled).toEqual([['frame', 11], ['idle', 22]]);
  });

  it('can cancel deferred shell refinement before the first paint completes', () => {
    let frame = null;
    let refinements = 0;
    const release = scheduleWarRoomV2AfterFirstPaint(
      () => { refinements += 1; },
      {
        requestFrame: (callback) => {
          frame = callback;
          return 7;
        },
        cancelFrame: () => {},
        requestIdle: () => {
          throw new Error('cancelled frame must not schedule idle work');
        },
      },
    );

    release();
    frame();
    expect(refinements).toBe(0);
  });

  it('keeps authored practicals cinematic and cheaper on coarse pointers', () => {
    const desktop = warRoomV2PracticalLightProfile();
    const coarse = warRoomV2PracticalLightProfile({ coarsePointer: true });
    expect(desktop.fire.color).toBe(0xff8a38);
    expect(desktop.rightFire.color).toBe(0xff7f30);
    expect(desktop.chandelier.color).toBe(0xffb457);
    expect(desktop.moon.color).toBe(0x7ba6ff);
    expect(desktop.fire.intensity).toBeGreaterThan(coarse.fire.intensity);
    expect(desktop.rightFire.intensity).toBeGreaterThan(coarse.rightFire.intensity);
    expect(desktop.chandelier.intensity).toBeGreaterThan(coarse.chandelier.intensity);
    expect(coarse.chandelier.intensity).toBe(0);
    expect(desktop.moon.intensity).toBeGreaterThan(coarse.moon.intensity);
    expect(desktop.rightFire.distance).toBeLessThan(desktop.fire.distance);
    expect(desktop.fire.distance).toBeLessThan(desktop.moon.distance);
    expect(desktop.fire.intensity).toBe(2.30);
    expect(desktop.fire.distance).toBe(10.8);
    expect(desktop.rightFire.intensity).toBe(1.68);
    expect(desktop.rightFire.distance).toBe(9.2);
    expect(desktop.chandelier.intensity).toBe(0.92);
    expect(desktop.chandelier.distance).toBe(7.8);
    expect(desktop.moon.intensity).toBe(3.42);
    expect(desktop.moon.distance).toBe(15.2);
  });

  it('keeps nocturnal materials below the old bright IBL levels', () => {
    expect(warRoomV2EnvMapIntensity('WR_MAT_wall_walnut')).toBe(0.26);
    expect(warRoomV2EnvMapIntensity('WR_MAT_stone')).toBe(0.16);
    expect(warRoomV2EnvMapIntensity('WR_MAT_canon_burgundy')).toBe(0.11);
    expect(warRoomV2EnvMapIntensity('WR_MAT_armor')).toBe(0.76);
  });

  it('uses restrained cinematic finish profiles instead of glossy mockup materials', () => {
    expect(warRoomV2MaterialFinishProfile('WR_MAT_canon_burgundy')).toEqual({
      colorScale: [0.78, 0.56, 0.62],
      roughness: [0.84, 1],
      clearcoatMax: 0.02,
    });
    expect(warRoomV2MaterialFinishProfile('WR_MAT_brass')).toEqual({
      colorScale: [0.92, 0.78, 0.58],
      roughness: [0.30, 0.46],
      clearcoatMax: 0.24,
    });
    expect(warRoomV2MaterialFinishProfile('WR_MAT_stone_light')).toEqual({
      colorScale: [0.88, 0.91, 0.98],
      roughness: [0.76, 0.96],
      clearcoatMax: 0.05,
    });
    expect(warRoomV2MaterialFinishProfile('unrelated')).toBe(null);
  });

  it('adds desktop-only microdetail to the authored stone family', () => {
    expect(warRoomV2RuntimeSurfaceKind('WR_MAT_wall_plaster')).toBe('stone');
    expect(warRoomV2RuntimeSurfaceKind('WR_MAT_floor_underlay')).toBe('stone');
    expect(warRoomV2RuntimeSurfaceKind('WR_MAT_stone_light')).toBe('stone');
    expect(warRoomV2RuntimeSurfaceKind('WR_MAT_wall_walnut')).toBe('wood');
    expect(warRoomV2RuntimeSurfaceKind('WR_MAT_table_walnut')).toBe('wood');
    expect(warRoomV2RuntimeSurfaceKind('WR_MAT_armor')).toBe(null);

    expect(warRoomV2StoneSurfaceProfile()).toEqual({
      enabled: true,
      size: 32,
      bumpScale: 0.012,
      albedoCompensation: 1.10,
    });
    expect(warRoomV2StoneSurfaceProfile({ coarsePointer: true })).toEqual({
      enabled: true,
      size: 24,
      bumpScale: 0,
      albedoCompensation: 1.10,
    });

    expect(warRoomV2WoodSurfaceProfile()).toEqual({
      enabled: true,
      size: 48,
      bumpScale: 0.007,
      albedoCompensation: 1.055,
    });
    expect(warRoomV2WoodSurfaceProfile({ coarsePointer: true })).toEqual({
      enabled: true,
      size: 32,
      bumpScale: 0,
      albedoCompensation: 1.055,
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
