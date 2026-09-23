import { describe, expect, it } from 'vitest';
import {
  configureWarRoomBlenderLoader,
  scheduleWarRoomAfterFirstPaint,
  warRoomBlenderEnvMapIntensity,
  warRoomBlenderFabricSurfaceProfile,
  warRoomBlenderLeatherSurfaceProfile,
  warRoomBlenderMaterialFinishProfile,
  warRoomBlenderMetalSurfaceProfile,
  warRoomBlenderPracticalLightProfile,
  warRoomBlenderRuntimeSurfaceKind,
  warRoomBlenderStoneSurfaceProfile,
  warRoomBlenderWoodSurfaceProfile,
} from './WarRoomBlenderShellRuntime.js';

describe('War Room shared Blender runtime', () => {
  it('registers the bundled Meshopt decoder on the shared GLTF loader', () => {
    let decoder = null;
    const loader = {
      setMeshoptDecoder(value) {
        decoder = value;
        return this;
      },
    };

    expect(configureWarRoomBlenderLoader(loader)).toBe(loader);
    expect(decoder).toBeTruthy();
    expect(decoder.ready).toBeTruthy();
  });

  it('defers expensive shell refinement until after a paint and an idle turn', () => {
    let frame = null;
    let idle = null;
    let refinements = 0;
    const cancelled = [];
    const release = scheduleWarRoomAfterFirstPaint(
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
    const release = scheduleWarRoomAfterFirstPaint(
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
    const desktop = warRoomBlenderPracticalLightProfile();
    const coarse = warRoomBlenderPracticalLightProfile({ coarsePointer: true });
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
    expect(warRoomBlenderEnvMapIntensity('WR_MAT_wall_walnut')).toBe(0.26);
    expect(warRoomBlenderEnvMapIntensity('WR_MAT_stone')).toBe(0.16);
    expect(warRoomBlenderEnvMapIntensity('WR_MAT_canon_burgundy')).toBe(0.11);
    expect(warRoomBlenderEnvMapIntensity('WR_MAT_armor')).toBe(0.76);
  });

  it('uses restrained cinematic finish profiles instead of glossy mockup materials', () => {
    expect(warRoomBlenderMaterialFinishProfile('WR_MAT_canon_burgundy')).toEqual({
      colorScale: [0.78, 0.56, 0.62],
      roughness: [0.84, 1],
      clearcoatMax: 0.02,
    });
    expect(warRoomBlenderMaterialFinishProfile('WR_MAT_canon_heraldic_brass')).toEqual({
      colorScale: [1.00, 0.96, 0.78],
      roughness: [0.22, 0.34],
      clearcoatMax: 0.26,
    });
    expect(warRoomBlenderMaterialFinishProfile('WR_MAT_brass')).toEqual({
      colorScale: [0.92, 0.78, 0.58],
      roughness: [0.30, 0.46],
      clearcoatMax: 0.24,
    });
    expect(warRoomBlenderMaterialFinishProfile('WR_MAT_wall_plaster')).toEqual({
      colorScale: [0.96, 0.96, 1.00],
      roughness: [0.76, 0.96],
      clearcoatMax: 0.05,
    });
    expect(warRoomBlenderMaterialFinishProfile('WR_MAT_stone_light')).toEqual({
      colorScale: [0.88, 0.91, 0.98],
      roughness: [0.76, 0.96],
      clearcoatMax: 0.05,
    });
    expect(warRoomBlenderMaterialFinishProfile('unrelated')).toBe(null);
  });

  it('adds desktop-only microdetail to the authored stone family', () => {
    expect(warRoomBlenderRuntimeSurfaceKind('WR_MAT_wall_plaster')).toBe('stone');
    expect(warRoomBlenderRuntimeSurfaceKind('WR_MAT_floor_underlay')).toBe('stone');
    expect(warRoomBlenderRuntimeSurfaceKind('WR_MAT_stone_light')).toBe('stone');
    expect(warRoomBlenderRuntimeSurfaceKind('WR_MAT_wall_walnut')).toBe('wood');
    expect(warRoomBlenderRuntimeSurfaceKind('WR_MAT_table_walnut')).toBe('wood');
    expect(warRoomBlenderRuntimeSurfaceKind('WR_MAT_brass')).toBe('metal');
    expect(warRoomBlenderRuntimeSurfaceKind('WR_MAT_canon_heraldic_brass')).toBe('metal');
    expect(warRoomBlenderRuntimeSurfaceKind('WR_MAT_armor')).toBe('metal');
    expect(warRoomBlenderRuntimeSurfaceKind('WR_MAT_canon_burgundy')).toBe('fabric');
    expect(warRoomBlenderRuntimeSurfaceKind('WR_MAT_rug')).toBe('fabric');
    expect(warRoomBlenderRuntimeSurfaceKind('WR_MAT_table_leather')).toBe('leather');

    expect(warRoomBlenderStoneSurfaceProfile()).toEqual({
      enabled: true,
      size: 32,
      bumpScale: 0.012,
      albedoCompensation: 1.10,
    });
    expect(warRoomBlenderStoneSurfaceProfile({ coarsePointer: true })).toEqual({
      enabled: true,
      size: 24,
      bumpScale: 0,
      albedoCompensation: 1.10,
    });

    expect(warRoomBlenderWoodSurfaceProfile()).toEqual({
      enabled: true,
      size: 48,
      bumpScale: 0.007,
      albedoCompensation: 1.055,
    });
    expect(warRoomBlenderWoodSurfaceProfile({ coarsePointer: true })).toEqual({
      enabled: true,
      size: 32,
      bumpScale: 0,
      albedoCompensation: 1.055,
    });

    expect(warRoomBlenderMetalSurfaceProfile()).toEqual({
      enabled: true,
      size: 48,
      bumpScale: 0.0045,
      albedoCompensation: 1.025,
    });
    expect(warRoomBlenderMetalSurfaceProfile({ coarsePointer: true })).toEqual({
      enabled: true,
      size: 24,
      bumpScale: 0,
      albedoCompensation: 1.02,
    });

    expect(warRoomBlenderFabricSurfaceProfile()).toEqual({
      enabled: true,
      size: 48,
      bumpScale: 0.006,
      albedoCompensation: 1.04,
    });
    expect(warRoomBlenderFabricSurfaceProfile({ coarsePointer: true })).toEqual({
      enabled: true,
      size: 24,
      bumpScale: 0,
      albedoCompensation: 1.035,
    });
    expect(warRoomBlenderLeatherSurfaceProfile()).toEqual({
      enabled: true,
      size: 48,
      bumpScale: 0.0075,
      albedoCompensation: 1.03,
    });
    expect(warRoomBlenderLeatherSurfaceProfile({ coarsePointer: true })).toEqual({
      enabled: true,
      size: 24,
      bumpScale: 0,
      albedoCompensation: 1.025,
    });
  });
});
