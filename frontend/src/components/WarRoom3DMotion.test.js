import { describe, expect, it } from 'vitest';
import {
  adaptiveRenderScale,
  applyWarRoomHemisphereGrade,
  applyWarRoomMaterialGrade,
  deriveMoveKinetics,
  inferCapturedPiece,
  nextRuntimeRenderScale,
  reactiveLightProfile,
  shadowRefreshInterval,
  shouldRefreshShadowMap,
  smoothstep,
  warRoomHemisphereIntensity,
  warRoomMaterialIblProfile,
} from './WarRoom3DMotion.js';

function fakeColor(hex) {
  let current = hex;
  return {
    getHex: () => current,
    copy(value) {
      current = value.getHex();
      return this;
    },
  };
}

describe('WarRoom3DMotion', () => {
  it('finds direct and en-passant-style captured pieces from real board deltas', () => {
    expect(inferCapturedPiece(
      [{ square: 'e4', type: 'p', color: 'w' }, { square: 'd5', type: 'p', color: 'b' }],
      [{ square: 'd5', type: 'p', color: 'w' }],
      { from: 'e4', to: 'd5', capture: true },
    )).toMatchObject({ square: 'd5', color: 'b' });

    expect(inferCapturedPiece(
      [{ square: 'e5', type: 'p', color: 'w' }, { square: 'd5', type: 'p', color: 'b' }],
      [{ square: 'd6', type: 'p', color: 'w' }],
      { from: 'e5', to: 'd6', capture: true },
    )).toMatchObject({ square: 'd5', color: 'b' });
  });

  it('gives knights and captures more physical travel than quiet rook-like moves', () => {
    const quiet = deriveMoveKinetics({ movingType: 'r' });
    const knight = deriveMoveKinetics({ movingType: 'n' });
    const capture = deriveMoveKinetics({ movingType: 'q', capture: true });
    expect(knight.lift).toBeGreaterThan(quiet.lift);
    expect(capture.duration).toBeGreaterThan(quiet.duration);
    expect(capture.captureTilt).toBeGreaterThan(0.5);
  });

  it('keeps move animations brisk so input is not hidden behind cinematic latency', () => {
    expect(deriveMoveKinetics({ movingType: 'p' }).duration).toBeLessThanOrEqual(190);
    expect(deriveMoveKinetics({ movingType: 'q', capture: true }).duration).toBeLessThanOrEqual(240);
    expect(deriveMoveKinetics({ movingType: 'q', capture: true, coarsePointer: true }).duration).toBeLessThanOrEqual(200);
  });

  it('normalizes the fixed War Room hemisphere fill before rendered desktop frames', () => {
    const hemisphere = {
      isHemisphereLight: true,
      intensity: 1.35,
      color: { getHex: () => 0xffefd0 },
      groundColor: { getHex: () => 0x10192b },
      parent: {},
    };
    const scene = { children: [hemisphere], userData: {} };

    expect(warRoomHemisphereIntensity()).toBe(1.24);
    expect(warRoomHemisphereIntensity({ coarsePointer: true })).toBe(1.35);
    expect(applyWarRoomHemisphereGrade(scene)).toBe(hemisphere);
    expect(hemisphere.intensity).toBe(1.24);
    expect(scene.userData.warRoomHemisphereIntensity).toBe(1.24);

    applyWarRoomHemisphereGrade(scene, { coarsePointer: true });
    expect(hemisphere.intensity).toBe(1.35);
  });

  it('makes ivory and light tiles visibly matte while leaving dark surfaces untouched', () => {
    const ivory = {
      color: fakeColor(0xd8c7aa),
      envMapIntensity: 0.64,
      roughness: 0.36,
      clearcoat: 0.44,
      clearcoatRoughness: 0.24,
      specularIntensity: 0.56,
      sheen: 0.04,
      sheenRoughness: 0.5,
      userData: { surfaceRole: 'ivory' },
    };
    const lightTile = {
      color: fakeColor(0xd9cfba),
      envMapIntensity: 0.5,
      roughness: 0.74,
      clearcoat: 0.18,
      clearcoatRoughness: 0.38,
      specularIntensity: 0.4,
      userData: { surfaceRole: 'board-light' },
    };
    const ebony = { color: fakeColor(0x262a30), envMapIntensity: 0.96, roughness: 0.28, userData: { surfaceRole: 'ebony' } };
    const darkTile = { color: fakeColor(0x5a4236), envMapIntensity: 0.5, roughness: 0.7, userData: { surfaceRole: 'board-dark' } };
    const objects = [ivory, lightTile, ebony, darkTile].map((material) => ({ isMesh: true, material }));
    const scene = {
      userData: {},
      traverse(callback) {
        for (const object of objects) callback(object);
      },
    };

    expect(warRoomMaterialIblProfile()).toMatchObject({
      ivoryEnvMax: 0.18,
      lightTileEnvMax: 0.24,
      ivoryRoughnessMin: 0.74,
      ivoryClearcoatMax: 0.12,
      ivorySpecularMax: 0.18,
      ivoryAlbedoScale: 0.88,
      lightTileRoughnessMin: 0.8,
      lightTileClearcoatMax: 0.1,
      lightTileSpecularMax: 0.26,
      lightTileAlbedoScale: 0.92,
    });
    const initialIvoryColor = ivory.color.getHex();
    const initialLightTileColor = lightTile.color.getHex();
    const initialEbony = { color: ebony.color.getHex(), env: ebony.envMapIntensity, roughness: ebony.roughness };
    const initialDarkTile = { color: darkTile.color.getHex(), env: darkTile.envMapIntensity, roughness: darkTile.roughness };

    const result = applyWarRoomMaterialGrade(scene);

    expect(result).toMatchObject({ adjusted: 2, ivory: 1, lightTile: 1 });
    expect(ivory.envMapIntensity).toBe(0.18);
    expect(ivory.roughness).toBe(0.74);
    expect(ivory.clearcoat).toBe(0.12);
    expect(ivory.clearcoatRoughness).toBe(0.58);
    expect(ivory.specularIntensity).toBe(0.18);
    expect(ivory.sheen).toBe(0.015);
    expect(ivory.sheenRoughness).toBe(0.72);
    expect(ivory.color.getHex()).not.toBe(initialIvoryColor);
    expect(ivory.userData.warRoomSurfaceGrade).toBe('aged-ivory-v2');

    expect(lightTile.envMapIntensity).toBe(0.24);
    expect(lightTile.roughness).toBe(0.8);
    expect(lightTile.clearcoat).toBe(0.1);
    expect(lightTile.clearcoatRoughness).toBe(0.56);
    expect(lightTile.specularIntensity).toBe(0.26);
    expect(lightTile.color.getHex()).not.toBe(initialLightTileColor);
    expect(lightTile.userData.warRoomSurfaceGrade).toBe('muted-light-tile-v2');

    expect({ color: ebony.color.getHex(), env: ebony.envMapIntensity, roughness: ebony.roughness }).toEqual(initialEbony);
    expect({ color: darkTile.color.getHex(), env: darkTile.envMapIntensity, roughness: darkTile.roughness }).toEqual(initialDarkTile);
    expect(scene.userData).toMatchObject({
      warRoomMaterialIblProfile: 'low-fill-v2',
      warRoomSurfaceGrade: 'aged-matte-v2',
      warRoomIvoryEnvMax: 0.18,
      warRoomLightTileEnvMax: 0.24,
      warRoomMaterialIblAdjusted: 2,
    });

    const gradedIvoryColor = ivory.color.getHex();
    const gradedLightTileColor = lightTile.color.getHex();
    expect(applyWarRoomMaterialGrade(scene)).toMatchObject({ adjusted: 0, ivory: 1, lightTile: 1 });
    expect(ivory.color.getHex()).toBe(gradedIvoryColor);
    expect(lightTile.color.getHex()).toBe(gradedLightTileColor);
  });

  it('keeps coarse-pointer material grade unchanged for readability', () => {
    const ivory = {
      color: fakeColor(0xd8c7aa),
      envMapIntensity: 0.64,
      roughness: 0.36,
      clearcoat: 0.44,
      specularIntensity: 0.56,
      userData: { surfaceRole: 'ivory' },
    };
    const scene = {
      userData: {},
      traverse(callback) {
        callback({ isMesh: true, material: ivory });
      },
    };

    const before = { color: ivory.color.getHex(), env: ivory.envMapIntensity, roughness: ivory.roughness, clearcoat: ivory.clearcoat };
    expect(warRoomMaterialIblProfile({ coarsePointer: true })).toBeNull();
    expect(applyWarRoomMaterialGrade(scene, { coarsePointer: true })).toMatchObject({ adjusted: 0, profile: null });
    expect({ color: ivory.color.getHex(), env: ivory.envMapIntensity, roughness: ivory.roughness, clearcoat: ivory.clearcoat }).toEqual(before);
  });

  it('does not retune unrelated hemisphere lights', () => {
    const other = {
      isHemisphereLight: true,
      intensity: 2,
      color: { getHex: () => 0xffffff },
      groundColor: { getHex: () => 0x000000 },
      parent: {},
    };
    const scene = { children: [other], userData: {} };
    expect(applyWarRoomHemisphereGrade(scene)).toBeNull();
    expect(other.intensity).toBe(2);
  });

  it('locks the desktop board key while leaving room exposure and practical ambience intact', () => {
    const normal = reactiveLightProfile();
    const check = reactiveLightProfile({ check: true });
    const terminal = reactiveLightProfile({ gameOver: true });

    expect(normal).toMatchObject({
      key: 1.42,
      rim: 12.15,
      warm: 4.85,
      exposure: 1.04,
      fogDensity: 0.0172,
    });
    expect(check.key).toBe(1.74);
    expect(check.rim).toBeGreaterThan(normal.rim);
    expect(check.warm).toBeLessThanOrEqual(normal.warm);
    expect(terminal.key).toBe(1.26);
    expect(terminal.exposure).toBeLessThan(normal.exposure);
    expect(terminal.rim).toBeLessThan(normal.rim);
    expect(terminal.fogDensity).toBeGreaterThan(normal.fogDensity);
  });

  it('keeps coarse-pointer lighting readable without adopting the brighter desktop exposure', () => {
    const desktop = reactiveLightProfile();
    const mobile = reactiveLightProfile({ coarsePointer: true });
    expect(mobile.exposure).toBeLessThan(desktop.exposure);
    expect(mobile.exposure).toBeLessThanOrEqual(1.005);
    expect(mobile.key).toBeGreaterThan(desktop.key);
    expect(mobile.key).toBeLessThanOrEqual(1.99);
    expect(mobile.rim).toBeGreaterThan(desktop.rim);
  });

  it('cuts animation resolution before frame loss becomes obvious', () => {
    expect(adaptiveRenderScale({ slowFrameCount: 0 })).toBe(1.2);
    expect(adaptiveRenderScale({ slowFrameCount: 4 })).toBe(0.9);
    expect(adaptiveRenderScale({ coarsePointer: true, slowFrameCount: 0 })).toBe(1);
    expect(adaptiveRenderScale({ coarsePointer: true, slowFrameCount: 4 })).toBe(0.75);
  });

  it('throttles the expensive shadow pass while preserving regular scene renders', () => {
    expect(shadowRefreshInterval()).toBe(120);
    expect(shadowRefreshInterval({ coarsePointer: true })).toBe(180);
    expect(shouldRefreshShadowMap({ now: 0 })).toBe(true);
    expect(shouldRefreshShadowMap({ now: 119, lastShadowAt: 0 })).toBe(false);
    expect(shouldRefreshShadowMap({ now: 120, lastShadowAt: 0 })).toBe(true);
    expect(shouldRefreshShadowMap({ now: 179, lastShadowAt: 0, coarsePointer: true })).toBe(false);
    expect(shouldRefreshShadowMap({ now: 180, lastShadowAt: 0, coarsePointer: true })).toBe(true);
  });

  it('degrades runtime DPR only after sustained contiguous slow frames', () => {
    let state = { scale: 1.35, slowFrameCount: 0 };
    for (let index = 0; index < 5; index += 1) {
      state = nextRuntimeRenderScale({ currentScale: state.scale, slowFrameCount: state.slowFrameCount, frameMs: 28 });
    }
    expect(state).toMatchObject({ scale: 1.15, slowFrameCount: 0, downgraded: true });

    for (let index = 0; index < 10; index += 1) {
      state = nextRuntimeRenderScale({ currentScale: state.scale, slowFrameCount: state.slowFrameCount, frameMs: 30 });
    }
    expect(state.scale).toBe(0.9);

    const sparse = nextRuntimeRenderScale({ currentScale: 1.35, slowFrameCount: 4, frameMs: 140 });
    expect(sparse).toMatchObject({ scale: 1.35, slowFrameCount: 0, downgraded: false });
  });

  it('uses a lower floor on coarse-pointer devices without dropping below it', () => {
    let state = { scale: 1, slowFrameCount: 0 };
    for (let index = 0; index < 10; index += 1) {
      state = nextRuntimeRenderScale({ currentScale: state.scale, slowFrameCount: state.slowFrameCount, frameMs: 32, coarsePointer: true });
    }
    expect(state.scale).toBe(0.75);
    expect(nextRuntimeRenderScale({ currentScale: 0.75, slowFrameCount: 5, frameMs: 35, coarsePointer: true }).scale).toBe(0.75);
  });

  it('does not expose the old document-level pointer suppression hook', async () => {
    const mod = await import('./WarRoom3DMotion.js');
    expect(mod.shouldSuppressWarRoomParallax).toBeUndefined();
  });

  it('smoothstep stays bounded', () => {
    expect(smoothstep(0.4, 0.8, -1)).toBe(0);
    expect(smoothstep(0.4, 0.8, 2)).toBe(1);
  });
});
