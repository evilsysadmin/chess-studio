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

  it('uses restrained check light and a dimmer terminal tableau', () => {
    const normal = reactiveLightProfile();
    const check = reactiveLightProfile({ check: true });
    const terminal = reactiveLightProfile({ gameOver: true });
    expect(check.rim).toBeGreaterThan(normal.rim);
    expect(terminal.exposure).toBeLessThan(normal.exposure);
    expect(terminal.fogDensity).toBeGreaterThan(normal.fogDensity);
  });

  it('degrades render scale only after sustained slow frames', () => {
    expect(adaptiveRenderScale({ slowFrameCount: 2 })).toBe(1.75);
    expect(adaptiveRenderScale({ slowFrameCount: 12 })).toBe(1.35);
    expect(adaptiveRenderScale({ coarsePointer: true, slowFrameCount: 12 })).toBe(1);
  });

  it('smoothstep stays bounded', () => {
    expect(smoothstep(0.4, 0.8, -1)).toBe(0);
    expect(smoothstep(0.4, 0.8, 2)).toBe(1);
  });
});
