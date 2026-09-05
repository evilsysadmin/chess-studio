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

    expect(warRoomHemisphereIntensity()).toBe(1.08);
    expect(warRoomHemisphereIntensity({ coarsePointer: true })).toBe(1.35);
    expect(applyWarRoomHemisphereGrade(scene)).toBe(hemisphere);
    expect(hemisphere.intensity).toBe(1.08);
    expect(scene.userData.warRoomHemisphereIntensity).toBe(1.08);

    applyWarRoomHemisphereGrade(scene, { coarsePointer: true });
    expect(hemisphere.intensity).toBe(1.35);
  });

  it('cuts environment fill on ivory and light tiles without touching ebony or dark tiles', () => {
    const ivory = { envMapIntensity: 0.64, userData: { surfaceRole: 'ivory' } };
    const lightTile = { envMapIntensity: 0.5, userData: { surfaceRole: 'board-light' } };
    const ebony = { envMapIntensity: 0.96, userData: { surfaceRole: 'ebony' } };
    const darkTile = { envMapIntensity: 0.5, userData: { surfaceRole: 'board-dark' } };
    const objects = [ivory, lightTile, ebony, darkTile].map((material) => ({ isMesh: true, material }));
    const scene = {
      userData: {},
      traverse(callback) {
        for (const object of objects) callback(object);
      },
    };

    expect(warRoomMaterialIblProfile()).toEqual({ ivoryEnvMax: 0.36, lightTileEnvMax: 0.34 });
    const result = applyWarRoomMaterialGrade(scene);

    expect(result).toMatchObject({ adjusted: 2, ivory: 1, lightTile: 1 });
    expect(ivory.envMapIntensity).toBe(0.36);
    expect(lightTile.envMapIntensity).toBe(0.34);
    expect(ebony.envMapIntensity).toBe(0.96);
    expect(darkTile.envMapIntensity).toBe(0.5);
    expect(ivory.userData.warRoomIblGrade).toBe('low-fill-v1');
    expect(lightTile.userData.warRoomIblGrade).toBe('low-fill-v1');
    expect(scene.userData).toMatchObject({
      warRoomMaterialIblProfile: 'low-fill-v1',
      warRoomIvoryEnvMax: 0.36,
      warRoomLightTileEnvMax: 0.34,
      warRoomMaterialIblAdjusted: 2,
    });
  });

  it('keeps coarse-pointer material IBL unchanged for readability', () => {
    const ivory = { envMapIntensity: 0.64, userData: { surfaceRole: 'ivory' } };
    const scene = {
      userData: {},
      traverse(callback) {
        callback({ isMesh: true, material: ivory });
      },
    };

    expect(warRoomMaterialIblProfile({ coarsePointer: true })).toBeNull();
    expect(applyWarRoomMaterialGrade(scene, { coarsePointer: true })).toMatchObject({ adjusted: 0, profile: null });
    expect(ivory.envMapIntensity).toBe(0.64);
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
