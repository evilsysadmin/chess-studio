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
    const win = eventTarget();
    const doc = eventTarget();
    const audio = {
      getAmbientPlaybackState: () => ({ status: 'playing' }),
      startAmbientMusic: vi.fn(), pauseAmbientMusic: vi.fn(), stopAmbientMusic: vi.fn(),
      selectRelativeAmbientTheme: vi.fn(), seekAmbientMusic: vi.fn(),
    };
    const resumeAudio = vi.fn(() => Promise.resolve(true));
    const release = bindAuthenticatedMediaSession(audio, { win, doc, nav: {}, resumeAudio });
    win.fire('pointerdown');
    expect(resumeAudio).toHaveBeenCalledTimes(1);
    expect(audio.startAmbientMusic).not.toHaveBeenCalled();
    expect(audio.stopAmbientMusic).not.toHaveBeenCalled();
    release();
  });

  it('no intenta despertar audio si está pausado o la pestaña sigue oculta', () => {
    const win = eventTarget();
    const doc = eventTarget();
    let status = 'paused';
    const audio = { getAmbientPlaybackState: () => ({ status }), startAmbientMusic: vi.fn(), pauseAmbientMusic: vi.fn(), stopAmbientMusic: vi.fn() };
    const resumeAudio = vi.fn(() => Promise.resolve(true));
    const release = bindAuthenticatedMediaSession(audio, { win, doc, nav: {}, resumeAudio });
    win.fire('focus');
    expect(resumeAudio).not.toHaveBeenCalled();

    status = 'playing';
    doc.visibilityState = 'hidden';
    doc.fire('visibilitychange');
    expect(resumeAudio).not.toHaveBeenCalled();
    doc.visibilityState = 'visible';
    doc.fire('visibilitychange');
    expect(resumeAudio).toHaveBeenCalledTimes(1);
    release();
  });

  it('libera todos los listeners al cerrar la sesión autenticada', () => {
    const win = eventTarget();
    const doc = eventTarget();
    const audio = { getAmbientPlaybackState: () => ({ status: 'paused' }) };
    const release = bindAuthenticatedMediaSession(audio, { win, doc, nav: {} });
    release();
    expect(win.removeEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(win.removeEventListener).toHaveBeenCalledWith('focus', expect.any(Function));
    expect(win.removeEventListener).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    expect(doc.removeEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });

});
