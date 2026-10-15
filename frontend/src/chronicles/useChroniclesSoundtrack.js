import { useEffect, useRef } from 'react';
import { r2AssetUrl } from '../r2Assets.js';
import {
  getAmbientPlaybackState,
  getAmbientVolume,
  isMusicMuted,
  pauseAmbientMusic,
  startAmbientMusic,
} from '../sound.js';

const FIRST_VERSE = 'chronicles.music.firstVerse';
const SECOND_VERSE = 'chronicles.music.secondVerse';

// Character creation belongs to the expedition menu, not to the playable map.
export function chroniclesSoundtrackIdForView(entryView) {
  return entryView === 'playing' ? SECOND_VERSE : FIRST_VERSE;
}

export function chroniclesSoundtrackGain(volume, muted) {
  if (muted) return 0;
  const preference = Number(volume);
  const normalized = Number.isFinite(preference) ? Math.max(0, Math.min(1, preference)) : 1;
  return normalized * 0.72; // Leave headroom for speech and SFX.
}

// Chronicles owns its own recorded score. The global radio retains its place
// and resumes only if it was actually playing before entering Chronicles.
export function useChroniclesSoundtrack(entryView) {
  const audioRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') return undefined;
    const audio = new Audio();
    audio.loop = true;
    audio.preload = 'auto';
    audioRef.current = audio;

    const globalStatus = getAmbientPlaybackState()?.status;
    const restoreGlobal = globalStatus === 'playing' || globalStatus === 'gap';
    if (restoreGlobal) pauseAmbientMusic();

    const syncPreferences = () => {
      audio.volume = chroniclesSoundtrackGain(getAmbientVolume(), isMusicMuted());
      // Transport/media-key controls may restart the global station while
      // Chronicles is foregrounded. Never play both soundtracks together.
      const status = getAmbientPlaybackState()?.status;
      if (status === 'playing' || status === 'gap') pauseAmbientMusic();
    };
    const retryAfterGesture = () => {
      // Autoplay is often blocked after F5 until the next real user gesture.
      if (!audio.src || !audio.paused || audio.error) return;
      const attempt = audio.play();
      if (attempt?.catch) void attempt.catch(() => {});
    };
    syncPreferences();
    window.addEventListener('chess-ambient-transport', syncPreferences);
    window.addEventListener('pointerdown', retryAfterGesture, { passive: true });
    window.addEventListener('keydown', retryAfterGesture);
    window.addEventListener('focus', retryAfterGesture);

    return () => {
      window.removeEventListener('chess-ambient-transport', syncPreferences);
      window.removeEventListener('pointerdown', retryAfterGesture);
      window.removeEventListener('keydown', retryAfterGesture);
      window.removeEventListener('focus', retryAfterGesture);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      if (audioRef.current === audio) audioRef.current = null;
      if (restoreGlobal) startAmbientMusic();
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const url = r2AssetUrl(chroniclesSoundtrackIdForView(entryView));
    if (!url) return;
    if (audio.src !== url) {
      audio.pause();
      audio.src = url;
      audio.load();
    }
    audio.volume = chroniclesSoundtrackGain(getAmbientVolume(), isMusicMuted());
    const attempt = audio.play();
    if (attempt?.catch) void attempt.catch(() => {});
  }, [entryView]);
}
