import { describe, expect, it, vi } from 'vitest';

vi.mock('../sound.js', () => ({
  getAmbientPlaybackState: () => ({ status: 'paused' }),
  getAmbientVolume: () => 1,
  isMusicMuted: () => false,
  pauseAmbientMusic: vi.fn(),
  startAmbientMusic: vi.fn(),
}));

import {
  chroniclesSoundtrackGain,
  chroniclesSoundtrackIdForView,
} from './useChroniclesSoundtrack.js';

describe('Chronicles recorded soundtrack', () => {
  it('plays the first verse in the expedition menu and character setup', () => {
    expect(chroniclesSoundtrackIdForView('menu')).toBe('chronicles.music.firstVerse');
    expect(chroniclesSoundtrackIdForView('setup')).toBe('chronicles.music.firstVerse');
  });

  it('plays the second verse only during a run', () => {
    expect(chroniclesSoundtrackIdForView('playing')).toBe('chronicles.music.secondVerse');
  });

  it('obeys the existing music volume and mute without altering effects', () => {
    expect(chroniclesSoundtrackGain(1, false)).toBeCloseTo(0.72);
    expect(chroniclesSoundtrackGain(0.5, false)).toBeCloseTo(0.36);
    expect(chroniclesSoundtrackGain(0.5, true)).toBe(0);
    expect(chroniclesSoundtrackGain(-5, false)).toBe(0);
    expect(chroniclesSoundtrackGain(5, false)).toBeCloseTo(0.72);
    expect(chroniclesSoundtrackGain(Number.NaN, false)).toBeCloseTo(0.72);
  });
});
