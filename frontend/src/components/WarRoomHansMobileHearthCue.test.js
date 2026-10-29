import { describe, expect, it } from 'vitest';
import {
  getWarRoomHansV2MobileHearthCueCopy as copy,
  showWarRoomHansV2MobileHearthCue as show,
} from './WarRoomHansMobileHearthCue.js';

const base = { variant: 'v2', screen: 'offscreen',
  choreographyPhase: 'stoke-fire', actorVisible: true,
  compactTouch: true, narrativePhase: 'await-hans' };

describe('V2 Hans mobile hearth presence', () => {
  it('signals real off-camera stoking only on a compact touch viewport', () => {
    expect(show(base)).toBe(true);
    expect(show({ ...base, choreographyPhase: 'carry-log' })).toBe(true);
    expect(show({ ...base, choreographyPhase: 'place-log' })).toBe(true);
    for (const patch of [
      { variant: 'v1' }, { variant: 'v3' }, { compactTouch: false },
      { screen: 'onscreen' }, { actorVisible: false },
      { choreographyPhase: 'leave' }, { choreographyPhase: 'take-log' },
      { narrativePhase: 'matthias' },
    ]) expect(show({ ...base, ...patch })).toBe(false);
  });

  it('announces only observed hearth work with phase-specific accessible copy', () => {
    expect(copy('carry-log')).toEqual({
      text: 'Preparando el fuego',
      ariaLabel: 'Hans está preparando el fuego fuera de cámara',
    });
    expect(copy('place-log')).toBe(copy('carry-log'));
    expect(copy('stoke-fire')).toEqual({
      text: 'Atizando el fuego',
      ariaLabel: 'Hans está atizando el fuego fuera de cámara',
    });
    for (const phase of ['take-log', 'leave', 'complete', '__proto__', '']) {
      expect(copy(phase)).toBeNull();
      expect(show({ ...base, choreographyPhase: phase })).toBe(false);
    }
  });
});
