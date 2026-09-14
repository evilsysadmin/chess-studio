import {
  destroyPawnSlugPremiumSfx,
  playPawnSlugEnemyImpactSfx,
  playPawnSlugEnemyKoSfx,
  playPawnSlugPlayerHitSfx,
  playPawnSlugWeaponSfx,
} from './pawnSlugSfx.js';
import { pawnSlugClamp } from './pawnSlugRuntimeCore.js';

const WEAPON_CUES = new Set(['pistol', 'machinegun', 'shotgun', 'panzerfaust']);

export function createPawnSlugRuntimeSfx() {
  if (typeof window === 'undefined') return { play() {}, setVolume() {}, destroy() {} };
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  let ctx = null;
  let master = null;
  let volume = 1;

  function ensure() {
    if (!AudioCtx) return null;
    if (ctx) return ctx;
    ctx = new AudioCtx();
    master = ctx.createGain();
    master.gain.value = 0.055 * volume;
    master.connect(ctx.destination);
    return ctx;
  }

  function tone(freq, duration, type = 'square', gainValue = 0.32, slide = 0, delay = 0) {
    const audio = ensure();
    if (!audio || !master) return;
    if (audio.state === 'suspended') void audio.resume().catch(() => {});
    const now = audio.currentTime + 0.005 + delay;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), now + duration);
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  function noise(duration = 0.12, gainValue = 0.18) {
    const audio = ensure();
    if (!audio || !master) return;
    const length = Math.max(1, Math.floor(audio.sampleRate * duration));
    const buffer = audio.createBuffer(1, length, audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) data[index] = (Math.random() * 2 - 1) * (1 - index / length);
    const source = audio.createBufferSource();
    const gain = audio.createGain();
    source.buffer = buffer;
    gain.gain.value = gainValue;
    source.connect(gain);
    gain.connect(master);
    source.start();
  }

  function playUiCue(kind) {
    if (kind === 'pickup') {
      tone(440, 0.08, 'square', 0.15, 220);
      tone(660, 0.09, 'square', 0.12, 220, 0.045);
    } else if (kind === 'levelUp') {
      tone(392, 0.08, 'triangle', 0.16, 120);
      tone(523, 0.09, 'triangle', 0.14, 160, 0.07);
      tone(784, 0.12, 'triangle', 0.12, 120, 0.145);
    } else if (kind === 'grenade') {
      noise(0.28, 0.36);
      tone(58, 0.24, 'triangle', 0.3, -25);
    } else if (kind === 'boss') {
      tone(55, 0.32, 'sawtooth', 0.22, 22);
      tone(73, 0.32, 'sawtooth', 0.18, -18, 0.18);
    }
  }

  return {
    play(kind, { enemy = false, enemyType = 'pawn', ko = false } = {}) {
      if (WEAPON_CUES.has(kind)) {
        playPawnSlugWeaponSfx(kind, { enemy });
        return;
      }
      if (kind === 'hit') {
        if (ko) playPawnSlugEnemyKoSfx(enemyType);
        else playPawnSlugEnemyImpactSfx(enemyType);
        return;
      }
      if (kind === 'hurt') {
        playPawnSlugPlayerHitSfx();
        return;
      }
      playUiCue(kind);
    },
    setVolume(value) {
      volume = pawnSlugClamp(Number(value) || 0, 0, 1);
      if (master) master.gain.value = 0.055 * volume;
    },
    destroy() {
      destroyPawnSlugPremiumSfx();
      if (!ctx) return;
      try { master?.disconnect(); } catch {}
      void ctx.close().catch(() => {});
      ctx = null;
      master = null;
    },
  };
}
