import { getAudioContext, resumeAudioContext } from './audioContext.js';
import { pawnSlugClamp } from './pawnSlugRuntimeCore.js';

const SHARED_NOISE_SECONDS = 0.5;

export function createPawnSlugRuntimeSfx() {
  if (typeof window === 'undefined') return { play() {}, setVolume() {}, destroy() {} };
  let master = null;
  let noiseBuffer = null;
  let volume = 1;
  let destroyed = false;

  function ensure() {
    if (destroyed) return null;
    const audio = getAudioContext();
    if (!audio) return null;
    if (!master) {
      master = audio.createGain();
      master.gain.value = 0.055 * volume;
      master.connect(audio.destination);
    }
    return audio;
  }

  function ensureNoiseBuffer(audio) {
    if (noiseBuffer?.sampleRate === audio.sampleRate) return noiseBuffer;
    const length = Math.max(1, Math.floor(audio.sampleRate * SHARED_NOISE_SECONDS));
    const buffer = audio.createBuffer(1, length, audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;
    noiseBuffer = buffer;
    return buffer;
  }

  function tone(freq, duration, type = 'square', gainValue = 0.32, slide = 0, delay = 0) {
    const audio = ensure();
    if (!audio || !master) return;
    if (audio.state === 'suspended') void resumeAudioContext();
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

  function noise(duration = 0.12, gainValue = 0.18, delay = 0) {
    const audio = ensure();
    if (!audio || !master) return;
    if (audio.state === 'suspended') void resumeAudioContext();
    const safeDuration = Math.max(0.005, Math.min(SHARED_NOISE_SECONDS, Number(duration) || 0.12));
    const maxOffset = Math.max(0, SHARED_NOISE_SECONDS - safeDuration);
    const offset = Math.random() * maxOffset;
    const now = audio.currentTime + 0.005 + delay;
    const source = audio.createBufferSource();
    const gain = audio.createGain();
    source.buffer = ensureNoiseBuffer(audio);
    gain.gain.setValueAtTime(Math.max(0.0001, gainValue), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + safeDuration);
    source.connect(gain);
    gain.connect(master);
    source.start(now, offset, safeDuration);
    source.stop(now + safeDuration + 0.01);
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
      else if (kind === 'pickup') {
        tone(440, 0.08, 'square', 0.15, 220);
        tone(660, 0.09, 'square', 0.12, 220, 0.045);
      } else if (kind === 'levelUp') {
        tone(392, 0.08, 'triangle', 0.16, 120);
        tone(523, 0.09, 'triangle', 0.14, 160, 0.07);
        tone(784, 0.12, 'triangle', 0.12, 120, 0.145);
      } else if (kind === 'hurt') {
        noise(0.08, 0.14);
        tone(84, 0.13, 'sawtooth', 0.18, -30);
      } else if (kind === 'boss') {
        tone(55, 0.32, 'sawtooth', 0.22, 22);
        tone(73, 0.32, 'sawtooth', 0.18, -18, 0.18);
      }
    },
    setVolume(value) {
      volume = pawnSlugClamp(Number(value) || 0, 0, 1);
      if (master) master.gain.value = 0.055 * volume;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      try { master?.disconnect(); } catch {}
      master = null;
      noiseBuffer = null;
    },
  };
}
