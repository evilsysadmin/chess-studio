import { describe, expect, it } from 'vitest';
import {
  MUSIC_PLAYER_PROGRESS_POLL_MS,
  musicPlayerShouldPollProgress,
} from './musicPlayerPolling.js';

describe('MusicPlayer progress polling policy', () => {
  it('duerme plegado y sólo refresca progreso expandido en pestaña visible', () => {
    expect(MUSIC_PLAYER_PROGRESS_POLL_MS).toBe(250);
    expect(musicPlayerShouldPollProgress({ expanded: false, documentVisible: true })).toBe(false);
    expect(musicPlayerShouldPollProgress({ expanded: true, documentVisible: true })).toBe(true);
    expect(musicPlayerShouldPollProgress({ forceExpanded: true, documentVisible: true })).toBe(true);
    expect(musicPlayerShouldPollProgress({ expanded: true, documentVisible: false })).toBe(false);
  });
});
