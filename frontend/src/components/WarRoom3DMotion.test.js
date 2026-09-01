import { describe, expect, it } from 'vitest';
import {
  adaptiveRenderScale,
  deriveMoveKinetics,
  inferCapturedPiece,
  nextRuntimeRenderScale,
  reactiveLightProfile,
  shadowRefreshInterval,
  shouldRefreshShadowMap,
  smoothstep,
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

  it('uses restrained check light and a dimmer terminal tableau', () => {
    const normal = reactiveLightProfile();
    const check = reactiveLightProfile({ check: true });
    const terminal = reactiveLightProfile({ gameOver: true });
    expect(check.rim).toBeGreaterThan(normal.rim);
    expect(terminal.exposure).toBeLessThan(normal.exposure);
    expect(terminal.fogDensity).toBeGreaterThan(normal.fogDensity);
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
