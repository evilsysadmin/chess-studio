import { describe, expect, it } from 'vitest';
import { deriveMoveKinetics } from './WarRoom3DMotion.js';

describe('War Room piece kinetics', () => {
  it('gives every chess piece a distinct quiet movement signature', () => {
    const profiles = Object.fromEntries(
      ['p', 'n', 'b', 'r', 'q', 'k'].map((type) => [type, deriveMoveKinetics({ movingType: type })]),
    );

    const signatures = Object.values(profiles).map(({ duration, lift }) => `${duration}:${lift}`);
    expect(new Set(signatures).size).toBe(6);

    expect(profiles.n.lift).toBeGreaterThan(0.25);
    expect(profiles.r.lift).toBeLessThan(profiles.b.lift);
    expect(profiles.q.duration).toBeLessThan(profiles.k.duration);
    expect(profiles.p.duration).toBeLessThan(profiles.r.duration);
  });

  it('preserves piece character on captures and coarse-pointer devices', () => {
    const knightCapture = deriveMoveKinetics({ movingType: 'n', capture: true });
    const rookCapture = deriveMoveKinetics({ movingType: 'r', capture: true });
    const mobileKnight = deriveMoveKinetics({ movingType: 'n', coarsePointer: true });
    const mobileRook = deriveMoveKinetics({ movingType: 'r', coarsePointer: true });

    expect(knightCapture.captureTilt).toBeGreaterThan(rookCapture.captureTilt);
    expect(knightCapture.impactStart).toBeLessThan(rookCapture.impactStart);
    expect(mobileKnight.lift).toBeGreaterThan(mobileRook.lift);
    expect(mobileKnight.duration).toBeGreaterThan(mobileRook.duration);
  });

  it('keeps premium motion brisk enough not to become input latency', () => {
    for (const type of ['p', 'n', 'b', 'r', 'q', 'k']) {
      expect(deriveMoveKinetics({ movingType: type }).duration).toBeLessThanOrEqual(170);
      expect(deriveMoveKinetics({ movingType: type, capture: true }).duration).toBeLessThanOrEqual(200);
      expect(deriveMoveKinetics({ movingType: type, capture: true, coarsePointer: true }).duration).toBeLessThanOrEqual(185);
    }
  });
});
