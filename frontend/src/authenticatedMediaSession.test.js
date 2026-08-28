import { describe, expect, it, vi } from 'vitest';
import { bindAuthenticatedMediaSession } from './authenticatedMediaSession.js';

function eventTarget() {
  const handlers = new Map();
  return {
    visibilityState: 'visible',
    addEventListener: vi.fn((type, fn) => handlers.set(type, fn)),
    removeEventListener: vi.fn((type, fn) => { if (handlers.get(type) === fn) handlers.delete(type); }),
    fire(type, event = {}) { handlers.get(type)?.(event); },
  };
}

describe('media session autenticada', () => {
  it('sigue controlando Retro Player aunque cambie la pantalla', () => {
    const win = eventTarget();
    const doc = eventTarget();
    const mediaHandlers = {};
    const nav = {
      audioSession: { type: 'auto' },
      mediaSession: { setActionHandler: vi.fn((action, fn) => { mediaHandlers[action] = fn; }) },
    };
    const audio = {
      getAmbientPlaybackState: vi.fn(() => ({ status: 'playing', cyclePositionMs: 5000, durationMs: 30000 })),
      selectRelativeAmbientTheme: vi.fn(),
      startAmbientMusic: vi.fn(),
      pauseAmbientMusic: vi.fn(),
      stopAmbientMusic: vi.fn(),
      seekAmbientMusic: vi.fn(),
    };

    const release = bindAuthenticatedMediaSession(audio, { nav, win, doc });
    expect(nav.audioSession.type).toBe('playback');
    mediaHandlers.nexttrack();
    expect(audio.selectRelativeAmbientTheme).toHaveBeenCalledWith(1);

    win.fire('keydown', { key: 'MediaPlayPause', preventDefault: vi.fn() });
    expect(audio.pauseAmbientMusic).toHaveBeenCalledTimes(1);

    win.fire('focus');
    expect(nav.mediaSession.setActionHandler).toHaveBeenCalledWith('nexttrack', expect.any(Function));
    release();
    expect(nav.mediaSession.setActionHandler).toHaveBeenCalledWith('nexttrack', null);
  });
});
