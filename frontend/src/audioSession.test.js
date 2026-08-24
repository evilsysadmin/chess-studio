import { beforeEach, describe, expect, it } from 'vitest';
import {
  AMBIENT_PLAYBACK_SESSION_KEY,
  AMBIENT_THEME_SESSION_KEY,
  clearAmbientThemeSessionStorage,
  markAmbientThemeSessionFresh,
  readAmbientPlaybackSession,
  writeAmbientPlaybackSession,
} from './audioSession.js';

describe('audioSession · transporte retro por sesión', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('reanuda playing avanzando desde la posición guardada', () => {
    writeAmbientPlaybackSession({ status: 'playing', themeId: 'andalus', positionMs: 12_000, savedAtMs: 1_000 });
    expect(readAmbientPlaybackSession({ now: 4_500 })).toMatchObject({
      status: 'playing',
      themeId: 'andalus',
      positionMs: 15_500,
      shouldPlay: true,
    });
  });

  it('paused y stopped sobreviven a refresh sin convertirse en Play', () => {
    writeAmbientPlaybackSession({ status: 'paused', themeId: 'andalus', positionMs: 42_000, savedAtMs: 1_000 });
    expect(readAmbientPlaybackSession({ now: 99_000 })).toMatchObject({
      status: 'paused', positionMs: 42_000, shouldPlay: false,
    });
    writeAmbientPlaybackSession({ status: 'stopped', themeId: 'andalus', positionMs: 0, savedAtMs: 1_000 });
    expect(readAmbientPlaybackSession({ now: 99_000 })).toMatchObject({
      status: 'stopped', positionMs: 0, shouldPlay: false,
    });
  });

  it('nuevo login y logout eliminan el transporte anterior', () => {
    writeAmbientPlaybackSession({ status: 'paused', themeId: 'andalus', positionMs: 42_000 });
    markAmbientThemeSessionFresh();
    expect(sessionStorage.getItem(AMBIENT_PLAYBACK_SESSION_KEY)).toBeNull();
    expect(sessionStorage.getItem(AMBIENT_THEME_SESSION_KEY)).toBe('__fresh__');

    writeAmbientPlaybackSession({ status: 'stopped', themeId: 'andalus' });
    clearAmbientThemeSessionStorage();
    expect(sessionStorage.getItem(AMBIENT_PLAYBACK_SESSION_KEY)).toBeNull();
    expect(sessionStorage.getItem(AMBIENT_THEME_SESSION_KEY)).toBeNull();
  });
});
