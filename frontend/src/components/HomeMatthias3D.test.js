import { describe, expect, it } from 'vitest';
import {
  homeMatthiasClipForProfile,
  homeMatthiasFacingRotation,
  homeMatthiasMotionPhase,
  homeMatthiasMotionProfile,
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

  it('keeps fallback animation phase deterministic while differentiating scenes', () => {
    const first = homeMatthiasMotionPhase({ scene: 'dossier', activity: 'Revisando el expediente' });
    expect(homeMatthiasMotionPhase({ scene: 'dossier', activity: 'Revisando el expediente' })).toBe(first);
    expect(homeMatthiasMotionPhase({ scene: 'reading', activity: 'Leyendo estrategia' })).not.toBe(first);
  });

  it('turns an exported rig around when the facial anchor points away from the Home camera', () => {
    expect(homeMatthiasFacingRotation({ headZ: 0.1, noseZ: -0.2 })).toBe(Math.PI);
    expect(homeMatthiasFacingRotation({ headZ: 0.1, noseZ: 0.4 })).toBe(0);
    expect(homeMatthiasFacingRotation({ headZ: 0.1, noseZ: 0.10001 })).toBe(0);
  });

  it('frames Matthias as a readable portrait instead of centering the whole pawn pedestal', () => {
    const frame = homeMatthiasPortraitFrame({ minY: 0, maxY: 2.35, fovDeg: 24 });
    expect(frame.targetY).toBeGreaterThan(1.4);
    expect(frame.targetY).toBeLessThan(1.5);
    expect(frame.distance).toBeGreaterThan(4);
    expect(frame.distance).toBeLessThan(4.5);
  });
});
