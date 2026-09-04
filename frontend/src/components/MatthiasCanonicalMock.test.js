import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  applyMatthiasCanonicalPose,
  createMatthiasCanonicalRig,
  disposeMatthiasCanonicalRig,
  MATTHIAS_CANONICAL_MOTION_CONTRACT,
  matthiasCanonicalLayerPose,
} from './MatthiasCanonicalMock.js';

describe('MatthiasCanonicalMock motion contract', () => {
  it('elimina el ruido de idle que hacía vibrar al retrato', () => {
    const pose = matthiasCanonicalLayerPose({
      headYaw: .018,
      headPitch: .012,
      headRoll: .008,
      bodyYaw: .006,
      bodyY: .006,
    });

    expect(pose).toEqual({
      rootY: 0,
      rootRoll: 0,
      headX: 0,
      headY: 0,
      headRoll: 0,
    });
  });

  it('conserva los gestos reales como desplazamiento de cuello, no como perspectiva', () => {
    const glance = matthiasCanonicalLayerPose({ headYaw: .24 });
    const nod = matthiasCanonicalLayerPose({ headPitch: .11 });
    const skeptical = matthiasCanonicalLayerPose({ headRoll: -.07, headYaw: .08 });

    expect(glance.headX).toBeGreaterThan(.06);
    expect(Math.abs(glance.headRoll)).toBeGreaterThan(.01);
    expect(Math.abs(nod.headY)).toBeGreaterThan(.025);
    expect(skeptical.headRoll).toBeLessThan(-.04);
  });

  it('mantiene escala 1 y prohíbe el falso zoom del cartón canónico', () => {
    const rig = createMatthiasCanonicalRig(new THREE.Texture());

    applyMatthiasCanonicalPose(rig, {
      headYaw: .24,
      headPitch: -.085,
      headRoll: -.07,
      bodyYaw: .02,
      bodyY: .018,
    });

    expect(MATTHIAS_CANONICAL_MOTION_CONTRACT).toBe('anchored-microgestures-v1');
    expect(rig.root.userData.motionContract).toBe(MATTHIAS_CANONICAL_MOTION_CONTRACT);
    expect(rig.root.scale.toArray()).toEqual([1, 1, 1]);
    expect(rig.headPivot.scale.toArray()).toEqual([1, 1, 1]);
    expect(rig.root.rotation.x).toBe(0);
    expect(rig.root.rotation.y).toBe(0);
    expect(rig.headPivot.rotation.x).toBe(0);
    expect(rig.headPivot.rotation.y).toBe(0);
    expect(Math.abs(rig.headPivot.position.x)).toBeGreaterThan(.05);
    expect(Math.abs(rig.headPivot.position.y - rig.base.headPivotY)).toBeGreaterThan(.02);

    disposeMatthiasCanonicalRig(rig);
  });
});
