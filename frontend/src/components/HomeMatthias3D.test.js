import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  homeMatthiasMotionPhase,
  homeMatthiasMotionProfile,
  homeMatthiasPoseSample,
} from './HomeMatthias3D.jsx';
import {
  applyHomeMatthiasCanonicalPose,
  createHomeMatthiasCanonicalRig,
  disposeHomeMatthiasCanonicalRig,
  HOME_MATTHIAS_CANONICAL_ART_VERSION,
  HOME_MATTHIAS_CANONICAL_RIG_VERSION,
  homeMatthiasCanonicalDataUrl,
} from './HomeMatthiasCanonicalRig.js';

describe('Home Matthias canonical Three rig', () => {
  it('maps real Home activities onto distinct motion routines', () => {
    expect(homeMatthiasMotionProfile({ scene: 'moment-loss-dossier', activity: 'Revisando viejas heridas' })).toBe('dossier');
    expect(homeMatthiasMotionProfile({ scene: 'moment-book-doze-sleep', activity: 'Dormido sobre el manual' })).toBe('sleep');
    expect(homeMatthiasMotionProfile({ scene: 'moment-solo-board-inception', activity: 'Ensayando una emboscada' })).toBe('think');
    expect(homeMatthiasMotionProfile({ scene: 'time-lunch-campaign-dinner', activity: 'Cena de campaña' })).toBe('bite');
    expect(homeMatthiasMotionProfile({ scene: 'coffee', activity: 'Café de campaña' })).toBe('sip');
    expect(homeMatthiasMotionProfile({ scene: 'ops', activity: 'Tomando notas' })).toBe('write');
    expect(homeMatthiasMotionProfile({ scene: 'reading', activity: 'Leyendo estrategia' })).toBe('read');
    expect(homeMatthiasMotionProfile({ scene: 'base', activity: 'Vigilando el desastre', speaking: true })).toBe('speak');
  });

  it('keeps routine phase deterministic while differentiating scenes', () => {
    const first = homeMatthiasMotionPhase({ scene: 'dossier', activity: 'Revisando el expediente' });
    expect(homeMatthiasMotionPhase({ scene: 'dossier', activity: 'Revisando el expediente' })).toBe(first);
    expect(homeMatthiasMotionPhase({ scene: 'reading', activity: 'Leyendo estrategia' })).not.toBe(first);
  });

  it('changes head language by routine without local face deformation', () => {
    const idle = homeMatthiasPoseSample({ profile: 'idle', time: 2 });
    const sleep = homeMatthiasPoseSample({ profile: 'sleep', time: 2 });
    const dossier = homeMatthiasPoseSample({ profile: 'dossier', time: 2 });
    const speak = homeMatthiasPoseSample({ profile: 'speak', time: 2, speaking: true });

    expect(sleep.headPitch).toBeGreaterThan(idle.headPitch + 0.03);
    expect(Math.abs(dossier.headYaw - idle.headYaw)).toBeGreaterThan(0.005);
    expect(Math.abs(speak.bodyY - idle.bodyY)).toBeGreaterThan(0.001);
  });

  it('reconstructs the approved art as rigid body and head layers', () => {
    const texture = new THREE.Texture();
    const rig = createHomeMatthiasCanonicalRig(texture);
    try {
      expect(rig.root.userData.artVersion).toBe(HOME_MATTHIAS_CANONICAL_ART_VERSION);
      expect(rig.root.userData.rigVersion).toBe(HOME_MATTHIAS_CANONICAL_RIG_VERSION);
      expect(rig.root.children).toHaveLength(2);
      expect(rig.headPivot.children).toHaveLength(1);

      applyHomeMatthiasCanonicalPose(rig, {
        bodyY: 0.01,
        bodyYaw: 9,
        bodyRoll: -9,
        headPitch: 9,
        headYaw: -9,
        headRoll: 9,
        breath: 9,
      });
      expect(rig.root.rotation.y).toBeCloseTo(0.08);
      expect(rig.root.rotation.z).toBeCloseTo(-0.022);
      expect(rig.headPivot.rotation.x).toBeCloseTo(0.11);
      expect(rig.headPivot.rotation.y).toBeCloseTo(-0.19);
      expect(rig.headPivot.rotation.z).toBeCloseTo(0.075);
      expect(rig.headPivot.scale.x).toBeCloseTo(1.007);
    } finally {
      disposeHomeMatthiasCanonicalRig(rig);
    }
  });

  it('accepts only the canonical WebP payload shape', () => {
    expect(homeMatthiasCanonicalDataUrl('  UklGRgAAAA  ')).toBe('data:image/webp;base64,UklGRgAAAA');
    expect(() => homeMatthiasCanonicalDataUrl('not-webp')).toThrow(/invalid/);
  });
});
