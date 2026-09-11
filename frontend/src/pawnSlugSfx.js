import { loadPawnSlugSettings } from './pawnSlugControls.js';

export const PAWN_SLUG_WEAPON_SOUND_PROFILES = Object.freeze({
  pistol: Object.freeze({ body: 118, crack: 1320, noise: 0.045, tail: 0.07 }),
  machinegun: Object.freeze({ body: 96, crack: 1680, noise: 0.035, tail: 0.055 }),
  shotgun: Object.freeze({ body: 68, crack: 760, noise: 0.14, tail: 0.18 }),
  panzerfaust: Object.freeze({ body: 46, crack: 310, noise: 0.24, tail: 0.32 }),
});

export const PAWN_SLUG_IMPACT_SOUND_PROFILES = Object.freeze({
  pawn: Object.freeze({ body: 112, ring: 0, noise: 0.055 }),
  knight: Object.freeze({ body: 92, ring: 880, noise: 0.045 }),
  rook: Object.freeze({ body: 74, ring: 620, noise: 0.06 }),
  bishop: Object.freeze({ body: 82, ring: 1040, noise: 0.055 }),
  boss: Object.freeze({ body: 52, ring: 430, noise: 0.09 }),
});

let ctx = null;
let master = null;
let lastImpactAt = -Infinity;
let lastVoiceAt = -Infinity;

function profileVolume() {
  const settings = loadPawnSlugSettings();
  return Math.max(0, Math.min(1, Number(settings.masterVolume) || 0))
    * Math.max(0, Math.min(1, Number(settings.sfxVolume) || 0));
}

function ensureAudio() {
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!ctx) {
    ctx = new AudioCtx();
    master = ctx.createGain();
    master.connect(ctx.destination);
  }
  master.gain.value = 0.055 * profileVolume();
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  return ctx;
}

function tone({ freq, endFreq = freq, duration = 0.08, gain = 0.12, type = 'triangle', delay = 0, filter = 0 }) {
  const audio = ensureAudio();
  if (!audio || !master || profileVolume() <= 0.001) return;
  const now = audio.currentTime + 0.004 + delay;
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(Math.max(20, freq), now);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
  amp.gain.setValueAtTime(Math.max(0.0001, gain), now);
  amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  if (filter > 0) {
    const node = audio.createBiquadFilter();
    node.type = 'bandpass';
    node.frequency.value = filter;
    node.Q.value = 1.1;
    osc.connect(node);
    node.connect(amp);
  } else {
    osc.connect(amp);
  }
  amp.connect(master);
  osc.start(now);
  osc.stop(now + duration + 0.025);
}

function noise({ duration = 0.08, gain = 0.12, cutoff = 2200, delay = 0 }) {
  const audio = ensureAudio();
  if (!audio || !master || profileVolume() <= 0.001) return;
  const length = Math.max(1, Math.floor(audio.sampleRate * duration));
  const buffer = audio.createBuffer(1, length, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < length; index += 1) {
    const envelope = 1 - index / length;
    data[index] = (Math.random() * 2 - 1) * envelope;
  }
  const source = audio.createBufferSource();
  const filter = audio.createBiquadFilter();
  const amp = audio.createGain();
  source.buffer = buffer;
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;
  amp.gain.value = gain;
  source.connect(filter);
  filter.connect(amp);
  amp.connect(master);
  source.start(audio.currentTime + 0.004 + delay);
}

export function pawnSlugWeaponSoundProfile(weapon = 'pistol') {
  return PAWN_SLUG_WEAPON_SOUND_PROFILES[weapon] || PAWN_SLUG_WEAPON_SOUND_PROFILES.pistol;
}

export function pawnSlugImpactSoundProfile(type = 'pawn') {
  return PAWN_SLUG_IMPACT_SOUND_PROFILES[type] || PAWN_SLUG_IMPACT_SOUND_PROFILES.pawn;
}

export function playPawnSlugWeaponSfx(weapon = 'pistol', { enemy = false } = {}) {
  const profile = pawnSlugWeaponSoundProfile(weapon);
  const scale = enemy ? 0.48 : 1;
  const pitch = enemy ? 0.9 : 1;
  noise({ duration: profile.noise, gain: 0.11 * scale, cutoff: weapon === 'panzerfaust' ? 900 : 3100 });
  tone({ freq: profile.body * pitch, endFreq: profile.body * 0.62 * pitch, duration: profile.tail, gain: 0.18 * scale, type: 'sawtooth' });
  tone({ freq: profile.crack * pitch, endFreq: profile.crack * 0.72 * pitch, duration: Math.min(0.055, profile.tail), gain: 0.09 * scale, type: 'square' });
  if (weapon === 'shotgun') noise({ duration: 0.055, gain: 0.11 * scale, cutoff: 5200, delay: 0.018 });
  if (weapon === 'panzerfaust') tone({ freq: 38, endFreq: 28, duration: 0.28, gain: 0.17 * scale, type: 'triangle', delay: 0.02 });
}

export function playPawnSlugEnemyImpactSfx(type = 'pawn') {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (now - lastImpactAt < 24) return;
  lastImpactAt = now;
  const profile = pawnSlugImpactSoundProfile(type);
  noise({ duration: profile.noise, gain: type === 'rook' || type === 'boss' ? 0.115 : 0.085, cutoff: type === 'pawn' ? 1250 : 2600 });
  tone({ freq: profile.body, endFreq: profile.body * 0.7, duration: 0.075, gain: 0.12, type: 'triangle' });
  if (profile.ring) tone({ freq: profile.ring, endFreq: profile.ring * 0.76, duration: type === 'rook' ? 0.12 : 0.075, gain: 0.055, type: 'sine' });
}

export function playPawnSlugEnemyDeathSfx(type = 'pawn') {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (now - lastVoiceAt < 105) return;
  lastVoiceAt = now;
  const base = type === 'rook' ? 92 : type === 'knight' ? 126 : type === 'bishop' ? 104 : type === 'boss' ? 72 : 142;
  const variation = 0.92 + Math.random() * 0.16;
  tone({ freq: base * variation, endFreq: base * 0.46, duration: type === 'boss' ? 0.42 : 0.26, gain: type === 'boss' ? 0.22 : 0.135, type: 'sawtooth', filter: type === 'rook' ? 520 : 720 });
  tone({ freq: base * 1.8 * variation, endFreq: base * 0.72, duration: type === 'boss' ? 0.34 : 0.2, gain: 0.055, type: 'triangle', filter: 1150, delay: 0.018 });
  noise({ duration: type === 'boss' ? 0.16 : 0.075, gain: 0.035, cutoff: 950, delay: 0.035 });
}

export function destroyPawnSlugPremiumSfx() {
  if (!ctx) return;
  try { master?.disconnect(); } catch {}
  void ctx.close().catch(() => {});
  ctx = null;
  master = null;
  lastImpactAt = -Infinity;
  lastVoiceAt = -Infinity;
}
