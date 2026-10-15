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

  it('resolves the actual manually uploaded R2 filenames, preserving their hashes', async () => {
    const { r2AssetEntry, r2AssetUrl } = await import('../r2Assets.js');
    for (const [id, basename, expectedSize] of [
      ['chronicles.music.firstVerse', 'Chronicles of matthias - First verse.mp3', 4871666],
      ['chronicles.music.secondVerse', 'Chronicles of matthias - Second verse.mp3', 4997378],
    ]) {
      const entry = r2AssetEntry(id);
      expect(entry.key).toBe(`chronicles/music/${basename}`);
      expect(entry.bytes).toBe(expectedSize);
      expect(entry.contentType).toBe('audio/mpeg');
      expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(r2AssetUrl(id)).toContain(encodeURIComponent(basename));
    }
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
