import { describe, expect, it } from 'vitest';
import {
  homeMatthiasCameraPose,
  homeMatthiasCanonicalFallbackDataUrl,
  homeMatthiasClipForProfile,
  homeMatthiasClipStartTime,
  homeMatthiasFrontDirectionFromPoints,
  homeMatthiasIsFrontGeometryName,
  homeMatthiasMotionPhase,
  homeMatthiasMotionProfile,
  homeMatthiasPlaybackPolicy,
  homeMatthiasPortraitFrame,
} from './HomeMatthias3D.jsx';

describe('Home Matthias canonical Blender rig', () => {
  it('maps real Home activities onto distinct rig routines', () => {
    expect(homeMatthiasMotionProfile({ scene: 'moment-loss-dossier', activity: 'Revisando viejas heridas' })).toBe('dossier');
    expect(homeMatthiasMotionProfile({ scene: 'moment-book-doze-sleep', activity: 'Dormido sobre el manual' })).toBe('sleep');
    expect(homeMatthiasMotionProfile({ scene: 'moment-solo-board-inception', activity: 'Ensayando una emboscada' })).toBe('think');
    expect(homeMatthiasMotionProfile({ scene: 'time-lunch-campaign-dinner', activity: 'Cena de campaña' })).toBe('bite');
    expect(homeMatthiasMotionProfile({ scene: 'coffee', activity: 'Café de campaña' })).toBe('sip');
    expect(homeMatthiasMotionProfile({ scene: 'ops', activity: 'Tomando notas' })).toBe('write');
    expect(homeMatthiasMotionProfile({ scene: 'reading', activity: 'Leyendo estrategia' })).toBe('read');
    expect(homeMatthiasMotionProfile({ scene: 'base', activity: 'Vigilando el desastre', speaking: true })).toBe('speak');
  });

  it('keeps every routine wired to a named Blender animation clip', () => {
    expect(homeMatthiasClipForProfile('idle')).toBe('Idle');
    expect(homeMatthiasClipForProfile('speak')).toBe('Speak');
    expect(homeMatthiasClipForProfile('sleep')).toBe('Sleep');
    expect(homeMatthiasClipForProfile('sip')).toBe('Sip');
    expect(homeMatthiasClipForProfile('bite')).toBe('Bite');
    expect(homeMatthiasClipForProfile('think')).toBe('Think');
    expect(homeMatthiasClipForProfile('write')).toBe('Write');
    expect(homeMatthiasClipForProfile('dossier')).toBe('Dossier');
    expect(homeMatthiasClipForProfile('read')).toBe('Read');
    expect(homeMatthiasClipForProfile('unknown')).toBe('Idle');
  });

  it('treats consumable routines as one-shots and persistent activities as loops', () => {
    expect(homeMatthiasPlaybackPolicy('sip')).toEqual({ loop: 'once', returnToIdle: true });
    expect(homeMatthiasPlaybackPolicy('bite')).toEqual({ loop: 'once', returnToIdle: true });
    expect(homeMatthiasPlaybackPolicy('read')).toEqual({ loop: 'repeat', returnToIdle: false });
    expect(homeMatthiasPlaybackPolicy('dossier')).toEqual({ loop: 'repeat', returnToIdle: false });
    expect(homeMatthiasPlaybackPolicy('speak')).toEqual({ loop: 'repeat', returnToIdle: false });
    expect(homeMatthiasPlaybackPolicy('unknown')).toEqual({ loop: 'repeat', returnToIdle: false });
  });

  it('starts looping routines at a deterministic scene phase but one-shots from their authored beginning', () => {
    expect(homeMatthiasClipStartTime({ duration: 4, phase: 5.25, profile: 'read' })).toBeCloseTo(1.25, 6);
    expect(homeMatthiasClipStartTime({ duration: 4, phase: -0.5, profile: 'idle' })).toBeCloseTo(3.5, 6);
    expect(homeMatthiasClipStartTime({ duration: 4, phase: 3.2, profile: 'sip' })).toBe(0);
    expect(homeMatthiasClipStartTime({ duration: 0, phase: 2, profile: 'read' })).toBe(0);
  });

  it('keeps fallback animation phase deterministic while differentiating scenes', () => {
    const first = homeMatthiasMotionPhase({ scene: 'dossier', activity: 'Revisando el expediente' });
    expect(homeMatthiasMotionPhase({ scene: 'dossier', activity: 'Revisando el expediente' })).toBe(first);
    expect(homeMatthiasMotionPhase({ scene: 'reading', activity: 'Leyendo estrategia' })).not.toBe(first);
  });

  it('frames the complete pawn silhouette instead of an accidental humanoid bust', () => {
    const frame = homeMatthiasPortraitFrame({ minY: 0, maxY: 2.35, fovDeg: 24 });
    expect(frame.targetY).toBeCloseTo(1.175, 6);
    expect(frame.distance).toBeGreaterThan(5.7);
    expect(frame.distance).toBeLessThan(5.8);
  });

  it('places the camera in front of the supplied facial direction without assuming Blender export axes', () => {
    const alongZ = homeMatthiasCameraPose({
      headX: 0,
      headZ: 0.1,
      noseX: 0,
      noseZ: -0.3,
      faceSource: 'head-eye-midpoint-vector',
      minY: 0,
      maxY: 2.35,
      centerX: 0.2,
      centerZ: 0.4,
      fovDeg: 24,
    });
    expect(alongZ.source).toBe('head-eye-midpoint-vector');
    expect(alongZ.faceX).toBeCloseTo(0, 6);
    expect(alongZ.faceZ).toBeCloseTo(-1, 6);
    expect(alongZ.cameraX).toBeCloseTo(0.2, 6);
    expect(alongZ.cameraZ).toBeLessThan(alongZ.targetZ);
    expect(alongZ.distance).toBeGreaterThan(5.7);
    expect(alongZ.distance).toBeLessThan(5.8);

    const alongX = homeMatthiasCameraPose({
      headX: -0.1,
      headZ: 0,
      noseX: 0.3,
      noseZ: 0,
      minY: 0,
      maxY: 2.35,
      fovDeg: 24,
    });
    expect(alongX.source).toBe('head-nose-vector');
    expect(alongX.faceX).toBeCloseTo(1, 6);
    expect(alongX.faceZ).toBeCloseTo(0, 6);
    expect(alongX.cameraX).toBeGreaterThan(alongX.targetX);
  });

  it('derives the front from visible mesh geometry instead of an authored axis guess', () => {
    const front = homeMatthiasFrontDirectionFromPoints({
      centerX: 0.1,
      centerZ: -0.2,
      points: [
        { x: 0.08, z: 0.42 },
        { x: 0.12, z: 0.44 },
        { x: 0.10, z: 0.52 },
        { x: 0.11, z: 0.48 },
      ],
    });
    expect(front).not.toBeNull();
    expect(front.count).toBe(4);
    expect(front.faceX).toBeCloseTo(0, 1);
    expect(front.faceZ).toBeGreaterThan(0.99);
    expect(front.anchorZ).toBeGreaterThan(0.4);
  });

  it('matches canonical front anchors after GLTFLoader sanitizes Blender node names', () => {
    expect(homeMatthiasIsFrontGeometryName('Eye.L')).toBe(true);
    expect(homeMatthiasIsFrontGeometryName('Eye_L')).toBe(true);
    expect(homeMatthiasIsFrontGeometryName('Classic cap badge')).toBe(true);
    expect(homeMatthiasIsFrontGeometryName('Classic_cap_badge')).toBe(true);
    expect(homeMatthiasIsFrontGeometryName('Unrelated mesh')).toBe(false);
  });

  it('rejects collapsed or missing front geometry so Home can use the canonical fallback', () => {
    expect(homeMatthiasFrontDirectionFromPoints({ centerX: 0, centerZ: 0, points: [] })).toBeNull();
    expect(homeMatthiasFrontDirectionFromPoints({
      centerX: 0,
      centerZ: 0,
      points: [{ x: 0, z: 0 }, { x: 0.001, z: 0.001 }],
    })).toBeNull();
  });

  it('turns only a valid canonical WebP payload into a fallback image', () => {
    expect(homeMatthiasCanonicalFallbackDataUrl('UklGAAAA')).toBe('data:image/webp;base64,UklGAAAA');
    expect(homeMatthiasCanonicalFallbackDataUrl(' nope ')).toBe('');
    expect(homeMatthiasCanonicalFallbackDataUrl()).toBe('');
  });

  it('uses a sane forward fallback only when facial anchors collapse', () => {
    const pose = homeMatthiasCameraPose({
      headX: 0.2,
      headZ: -0.4,
      noseX: 0.2,
      noseZ: -0.4,
      minY: 0,
      maxY: 2.35,
      fovDeg: 24,
    });
    expect(pose.source).toBe('fallback-axis');
    expect(pose.faceX).toBe(0);
    expect(pose.faceZ).toBe(1);
    expect(pose.cameraZ).toBeGreaterThan(pose.targetZ);
  });
});
