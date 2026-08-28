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
  it('reanuda Web Audio en el primer gesto tras F5 si el transporte seguía reproduciendo', () => {
    const listeners = new Map();
    const win = {
      addEventListener: (name, fn) => listeners.set(name, fn),
      removeEventListener: () => {},
    };
    const doc = {
      visibilityState: 'visible',
      addEventListener: (name, fn) => listeners.set(name, fn),
      removeEventListener: () => {},
    };
    const audio = {
      getAmbientPlaybackState: () => ({ status: 'playing' }),
      startAmbientMusic: vi.fn(), pauseAmbientMusic: vi.fn(), stopAmbientMusic: vi.fn(),
      selectRelativeAmbientTheme: vi.fn(), seekAmbientMusic: vi.fn(),
    };
    const resumeAudio = vi.fn(() => Promise.resolve(true));
    const release = bindAuthenticatedMediaSession(audio, { win, doc, nav: {}, resumeAudio });
    listeners.get('pointerdown')?.({});
    expect(resumeAudio).toHaveBeenCalledTimes(1);
    release();
  });

});
