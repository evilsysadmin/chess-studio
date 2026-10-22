import { describe, expect, it } from 'vitest';
import { showWarRoomHansV2MobileHearthCue as show } from './WarRoomHansMobileHearthCue.js';

const base = { variant: 'v2', screen: 'offscreen',
  choreographyPhase: 'stoke-fire', actorVisible: true,
  compactTouch: true, narrativePhase: 'await-hans' };

describe('V2 Hans mobile hearth presence', () => {
  it('signals real off-camera stoking only on a compact touch viewport', () => {
    expect(show(base)).toBe(true);
    for (const patch of [
      { variant: 'v1' }, { variant: 'v3' }, { compactTouch: false },
      { screen: 'onscreen' }, { actorVisible: false },
      { choreographyPhase: 'leave' }, { choreographyPhase: 'take-log' },
      { narrativePhase: 'matthias' },
    ]) expect(show({ ...base, ...patch })).toBe(false);
  });
});
