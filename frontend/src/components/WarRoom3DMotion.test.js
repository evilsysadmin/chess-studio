import { describe, expect, it } from 'vitest';
import {
  adaptiveRenderScale,
  deriveMoveKinetics,
  inferCapturedPiece,
  reactiveLightProfile,
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
    expect(deriveMoveKinetics({ movingType: 'p' }).duration).toBeLessThanOrEqual(230);
    expect(deriveMoveKinetics({ movingType: 'q', capture: true }).duration).toBeLessThanOrEqual(300);
    expect(deriveMoveKinetics({ movingType: 'q', capture: true, coarsePointer: true }).duration).toBeLessThanOrEqual(230);
  });

  it('uses restrained check light and a dimmer terminal tableau', () => {
    const normal = reactiveLightProfile();
    const check = reactiveLightProfile({ check: true });
    const terminal = reactiveLightProfile({ gameOver: true });
    expect(check.rim).toBeGreaterThan(normal.rim);
    expect(terminal.exposure).toBeLessThan(normal.exposure);
    expect(terminal.fogDensity).toBeGreaterThan(normal.fogDensity);
  });

  it('starts animations on a sane HiDPI budget and degrades quickly on slow frames', () => {
    expect(adaptiveRenderScale({ slowFrameCount: 0 })).toBe(1.35);
    expect(adaptiveRenderScale({ slowFrameCount: 6 })).toBe(1);
    expect(adaptiveRenderScale({ coarsePointer: true, slowFrameCount: 0 })).toBe(1);
    expect(adaptiveRenderScale({ coarsePointer: true, slowFrameCount: 5 })).toBe(0.8);
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