import { describe, expect, it } from 'vitest';
import {
  applyChroniclesExplorationGait,
  chroniclesExplorationMotion,
} from './chroniclesTacticsLocomotionPresentation.js';

function point(x, z) {
  return {
    x,
    z,
    distanceToSquared(other) {
      return (this.x - other.x) ** 2 + (this.z - other.z) ** 2;
    },
  };
}

describe('Chronicles Tactics exploration locomotion presentation', () => {
  it('enters walking motion only for a moving compact exploration party', () => {
    const moving = chroniclesExplorationMotion(point(0, 0), point(1, 0), 'explore-compact');
    const settled = chroniclesExplorationMotion(point(1, 0), point(1, 0), 'explore-compact');
    const combat = chroniclesExplorationMotion(point(0, 0), point(1, 0), 'combat-grid');

    expect(moving).toMatchObject({ moving: true, rootLerp: 0.12, memberLerp: 0.16 });
    expect(settled).toMatchObject({ moving: false, rootLerp: 0.14, memberLerp: 0.2 });
    expect(combat.moving).toBe(false);
  });

  it('adds a visible gait while walking and relaxes back to idle', () => {
    const model = {
      userData: {},
      rotation: { y: Math.PI, z: 0 },
      position: { y: 0 },
    };

    applyChroniclesExplorationGait(model, {
      moving: true,
      yaw: Math.PI / 2,
      time: 0.2,
      phaseSeed: 1,
      hpRatio: 1,
    });
    expect(Math.abs(model.rotation.z)).toBeGreaterThan(0);
    expect(model.position.y).toBeGreaterThanOrEqual(0);

    const walkingTilt = Math.abs(model.rotation.z);
    applyChroniclesExplorationGait(model, {
      moving: false,
      yaw: Math.PI,
      time: 0.3,
      phaseSeed: 1,
      hpRatio: 1,
    });
    expect(Math.abs(model.rotation.z)).toBeLessThan(walkingTilt);
  });
});
