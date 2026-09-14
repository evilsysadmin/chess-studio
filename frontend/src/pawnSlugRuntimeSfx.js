import { pawnSlugClamp } from './pawnSlugRuntimeCore.js';

export function createPawnSlugRuntimeSfx() {
  if (typeof window === 'undefined') return { play() {}, setVolume() {}, destroy() {} };
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return { play() {}, setVolume() {}, destroy() {} };
  let ctx = null;
  let master = null;
  let volume = 1;
  let destroyed = false;
  const timers = new Set();

  function schedule(callback, delay) {
    if (destroyed) return;
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (!destroyed) callback();
    }, delay);
    timers.add(timer);
  }

  function ensure() {
    if (destroyed) return null;
    if (ctx) return ctx;
    ctx = new AudioCtx();
    master = ctx.createGain();
    master.gain.value = 0.055 * volume;
    master.connect(ctx.destination);
    return ctx;
  }

  function tone(freq, duration, type = 'square', gainValue = 0.32, slide = 0) {
    const audio = ensure();
    if (!audio || !master) return;
    if (audio.state === 'suspended') void audio.resume().catch(() => {});
    const now = audio.currentTime + 0.005;
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
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = audio.createBufferSource();
    const gain = audio.createGain();
    source.buffer = buffer;
    gain.gain.value = gainValue;
    source.connect(gain);
    gain.connect(master);
    source.start();
  }

  return {
    play(kind) {
      if (destroyed) return;
      if (kind === 'pistol') tone(220, 0.055, 'square', 0.22, -100);
      else if (kind === 'machinegun') tone(155, 0.045, 'square', 0.16, -65);
      else if (kind === 'shotgun') { noise(0.12, 0.28); tone(92, 0.12, 'sawtooth', 0.2, -45); }
      else if (kind === 'panzerfaust') { noise(0.22, 0.34); tone(70, 0.2, 'sawtooth', 0.24, -35); }
      else if (kind === 'grenade') { noise(0.28, 0.36); tone(58, 0.24, 'triangle', 0.3, -25); }
      else if (kind === 'hit') tone(105, 0.06, 'square', 0.13, -35);
      else if (kind === 'pickup') { tone(440, 0.08, 'square', 0.15, 220); schedule(() => tone(660, 0.09, 'square', 0.12, 220), 45); }
      else if (kind === 'levelUp') { tone(392, 0.08, 'triangle', 0.16, 120); schedule(() => tone(523, 0.09, 'triangle', 0.14, 160), 70); schedule(() => tone(784, 0.12, 'triangle', 0.12, 120), 145); }
      else if (kind === 'hurt') { noise(0.08, 0.14); tone(84, 0.13, 'sawtooth', 0.18, -30); }
      else if (kind === 'boss') { tone(55, 0.32, 'sawtooth', 0.22, 22); schedule(() => tone(73, 0.32, 'sawtooth', 0.18, -18), 180); }
    },
    setVolume(value) {
      volume = pawnSlugClamp(Number(value) || 0, 0, 1);
      if (master) master.gain.value = 0.055 * volume;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      if (!ctx) return;
      try { master?.disconnect(); } catch {}
      void ctx.close().catch(() => {});
      ctx = null;
      master = null;
    },
  };
}
