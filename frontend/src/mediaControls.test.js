import { describe, expect, it, vi } from 'vitest';
import { claimMediaSessionHandlers, requestPlaybackAudioSession, syncMediaSessionState } from './mediaControls.js';

describe('media controls del sistema', () => {
  it('declara playback exclusivo cuando Audio Session está disponible', () => {
    const nav = { audioSession: { type: 'auto' } };
    requestPlaybackAudioSession(nav);
    expect(nav.audioSession.type).toBe('playback');
  });

  it('sincroniza playbackState y posición sin necesitar un audio element', () => {
    const setPositionState = vi.fn();
    const nav = { audioSession: { type: 'auto' }, mediaSession: { playbackState: 'none', setPositionState } };
    syncMediaSessionState({ nav, status: 'playing', durationMs: 120000, positionMs: 30000, title: 'Tema' });
    expect(nav.mediaSession.playbackState).toBe('playing');
    expect(nav.audioSession.type).toBe('playback');
    expect(setPositionState).toHaveBeenCalledWith({ duration: 120, playbackRate: 1, position: 30 });
  });

  it('registra y libera handlers de media keys', () => {
    const setActionHandler = vi.fn();
    const nav = { audioSession: { type: 'auto' }, mediaSession: { setActionHandler } };
    const seekTo = vi.fn();
    const seekBackward = vi.fn();
    const seekForward = vi.fn();
    const handlers = {};
    setActionHandler.mockImplementation((action, handler) => { handlers[action] = handler; });
    const release = claimMediaSessionHandlers({ nav, previous: vi.fn(), next: vi.fn(), play: vi.fn(), pause: vi.fn(), stop: vi.fn(), seekTo, seekBackward, seekForward });
    expect(setActionHandler).toHaveBeenCalledWith('previoustrack', expect.any(Function));
    expect(setActionHandler).toHaveBeenCalledWith('nexttrack', expect.any(Function));
    expect(setActionHandler).toHaveBeenCalledWith('seekto', expect.any(Function));
    expect(setActionHandler).toHaveBeenCalledWith('seekbackward', expect.any(Function));
    expect(setActionHandler).toHaveBeenCalledWith('seekforward', expect.any(Function));
    handlers.seekto({ seekTime: 42 });
    handlers.seekbackward({ seekOffset: 7 });
    handlers.seekforward({ seekOffset: 13 });
    expect(seekTo).toHaveBeenCalledWith(42);
    expect(seekBackward).toHaveBeenCalledWith(7);
    expect(seekForward).toHaveBeenCalledWith(13);
    release();
    expect(setActionHandler).toHaveBeenCalledWith('previoustrack', null);
    expect(setActionHandler).toHaveBeenCalledWith('seekto', null);
  });
});
