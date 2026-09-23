import { describe, expect, it } from 'vitest';
import {
  warRoomBlenderEnvMapIntensity,
  warRoomBlenderFabricSurfaceProfile,
  warRoomBlenderLeatherSurfaceProfile,
  warRoomBlenderMaterialFinishProfile,
  warRoomBlenderMetalSurfaceProfile,
  warRoomBlenderRuntimeSurfaceKind,
  warRoomBlenderStoneSurfaceProfile,
  warRoomBlenderWoodSurfaceProfile,
} from './WarRoomBlenderMaterials.js';

describe('War Room shared Blender materials', () => {
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
