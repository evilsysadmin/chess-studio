import { describe, expect, it } from 'vitest';
import {
  homeMatthiasMotionPhase,
  homeMatthiasMotionProfile,
} from './HomeMatthias3D.jsx';

describe('Home Matthias canonical scene render', () => {
  it('maps real Home activities onto distinct whole-sprite routines', () => {
    expect(homeMatthiasMotionProfile({ scene: 'moment-loss-dossier', activity: 'Revisando viejas heridas' })).toBe('dossier');
    expect(homeMatthiasMotionProfile({ scene: 'moment-book-doze-sleep', activity: 'Dormido sobre el manual' })).toBe('sleep');
    expect(homeMatthiasMotionProfile({ scene: 'moment-solo-board-inception', activity: 'Ensayando una emboscada' })).toBe('think');
    expect(homeMatthiasMotionProfile({ scene: 'time-lunch-campaign-dinner', activity: 'Cena de campaña' })).toBe('bite');
    expect(homeMatthiasMotionProfile({ scene: 'coffee', activity: 'Café de campaña' })).toBe('sip');
    expect(homeMatthiasMotionProfile({ scene: 'ops', activity: 'Tomando notas' })).toBe('write');
    expect(homeMatthiasMotionProfile({ scene: 'reading', activity: 'Leyendo estrategia' })).toBe('read');
    expect(homeMatthiasMotionProfile({ scene: 'base', activity: 'Vigilando el desastre', speaking: true })).toBe('speak');
  });

  it('keeps animation phase deterministic while differentiating scenes', () => {
    const first = homeMatthiasMotionPhase({ scene: 'dossier', activity: 'Revisando el expediente' });
    expect(homeMatthiasMotionPhase({ scene: 'dossier', activity: 'Revisando el expediente' })).toBe(first);
    expect(homeMatthiasMotionPhase({ scene: 'reading', activity: 'Leyendo estrategia' })).not.toBe(first);
  });
});
