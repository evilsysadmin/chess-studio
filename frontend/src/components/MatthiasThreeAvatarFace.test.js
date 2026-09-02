import { describe, expect, it } from 'vitest';
import { matthiasThreeMotionSample } from './MatthiasThreeAvatar.jsx';

describe('Matthias Home face preservation', () => {
  it('keeps the central face rigid while the chess-thinking arm still moves', () => {
    const face = matthiasThreeMotionSample({ profile: 'think', x: 0, y: .31, time: 1.8, motionIntensity: 1.2 });
    const arm = matthiasThreeMotionSample({ profile: 'think', x: .36, y: -.18, time: 1.8, motionIntensity: 1.2 });

    expect(Math.abs(face.dx)).toBeLessThan(.0001);
    expect(Math.abs(face.dy)).toBeLessThan(.0001);
    expect(Math.abs(face.dz)).toBeLessThan(.0001);
    expect(arm.dy).toBeGreaterThan(.14);
  });
});
