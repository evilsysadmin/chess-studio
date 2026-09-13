import { loadPawnSlugSettings } from './pawnSlugControls.js';

export const PAWN_SLUG_WEAPON_SOUND_PROFILES = Object.freeze({
  pistol: Object.freeze({ body: 118, crack: 1320, noise: 0.045, tail: 0.07, mechanic: 'casing' }),
  machinegun: Object.freeze({ body: 96, crack: 1680, noise: 0.035, tail: 0.055, mechanic: 'rattle' }),
  shotgun: Object.freeze({ body: 68, crack: 760, noise: 0.14, tail: 0.18, mechanic: 'pump' }),
  panzerfaust: Object.freeze({ body: 46, crack: 310, noise: 0.24, tail: 0.32, mechanic: 'tube' }),
});

export const PAWN_SLUG_WEAPON_PITCH_WIDTHS = Object.freeze({
  pistol: 0.022,
  machinegun: 0.012,
  shotgun: 0.032,
  panzerfaust: 0.016,
});

export const PAWN_SLUG_HOSTILE_WEAPON_SCALES = Object.freeze({
  pistol: 0.46,
  machinegun: 0.44,
  shotgun: 0.56,
  panzerfaust: 0.64,
});

export const PAWN_SLUG_WEAPON_STEREO_PAN = Object.freeze({
  player: -0.08,
  enemy: 0.14,
});

export const PAWN_SLUG_IMPACT_SOUND_PROFILES = Object.freeze({
  pawn: Object.freeze({ body: 112, ring: 0, noise: 0.055 }),
  knight: Object.freeze({ body: 92, ring: 880, noise: 0.045 }),
  rook: Object.freeze({ body: 74, ring: 620, noise: 0.06 }),
  bishop: Object.freeze({ body: 82, ring: 1040, noise: 0.055 }),
  boss: Object.freeze({ body: 52, ring: 430, noise: 0.09 }),
});

const SHARED_NOISE_SECONDS = 0.5;
const PLAYER_WEAPON_SCALE = 0.72;

export const PAWN_SLUG_SFX_RESOURCE_META = Object.freeze({
  sharedNoiseBufferSeconds: SHARED_NOISE_SECONDS,
  noiseStrategy: 'shared-random-window',
  weaponPannerStrategy: 'shared-player-enemy',
});

let ctx = null;
let master = null;
let playerWeaponPanner = null;
let enemyWeaponPanner = null;
let sharedNoiseBuffer = null;
let lastImpactAt = -Infinity;
let lastKoAt = -Infinity;
let lastPlayerHitAt = -Infinity;

function profileVolume() {
  const settings = loadPawnSlugSettings();
  return Math.max(0, Math.min(1, Number(settings.masterVolume) || 0))
    * Math.max(0, Math.min(1, Number(settings.sfxVolume) || 0));
}

function createWeaponPanner(audio, pan) {
  if (typeof audio.createStereoPanner !== 'function') return null;
  const panner = audio.createStereoPanner();
  panner.pan.value = pan;
  panner.connect(master);
  return panner;
}

function ensureAudio() {
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!ctx) {
    ctx = new AudioCtx();
    master = ctx.createGain();
    master.connect(ctx.destination);
    playerWeaponPanner = createWeaponPanner(ctx, PAWN_SLUG_WEAPON_STEREO_PAN.player);
    enemyWeaponPanner = createWeaponPanner(ctx, PAWN_SLUG_WEAPON_STEREO_PAN.enemy);
  }
  master.gain.value = 0.055 * profileVolume();
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  return ctx;
}

function ensureSharedNoiseBuffer(audio) {
  if (sharedNoiseBuffer?.sampleRate === audio.sampleRate) return sharedNoiseBuffer;
  const length = Math.max(1, Math.floor(audio.sampleRate * SHARED_NOISE_SECONDS));
  const buffer = audio.createBuffer(1, length, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;
  sharedNoiseBuffer = buffer;
  return sharedNoiseBuffer;
}

export function pawnSlugNoiseWindow(duration = 0.08, unit = 0.5) {
  const safeDuration = Math.max(0.005, Math.min(SHARED_NOISE_SECONDS, Number(duration) || 0.08));
  const t = Math.max(0, Math.min(1, Number(unit) || 0));
  const maxOffset = Math.max(0, SHARED_NOISE_SECONDS - safeDuration);
  return Object.freeze({ duration: safeDuration, offset: maxOffset * t });
}

export function pawnSlugSoundPitchVariation(unit = 0.5, { enemy = false, width = 0.035 } = {}) {
  const t = Math.max(0, Math.min(1, Number(unit) || 0));
  const spread = Math.max(0, Math.min(0.08, Number(width) || 0));
  const center = enemy ? 0.9 : 1;
  return center * (1 - spread + t * spread * 2);
}

export function pawnSlugWeaponPitchWidth(weapon = 'pistol') {
  return PAWN_SLUG_WEAPON_PITCH_WIDTHS[weapon] ?? PAWN_SLUG_WEAPON_PITCH_WIDTHS.pistol;
}

export function pawnSlugWeaponGainScale(weapon = 'pistol', { enemy = false } = {}) {
  if (!enemy) return PLAYER_WEAPON_SCALE;
  return PAWN_SLUG_HOSTILE_WEAPON_SCALES[weapon] ?? PAWN_SLUG_HOSTILE_WEAPON_SCALES.pistol;
}

export function pawnSlugWeaponStereoPan({ enemy = false } = {}) {
  return enemy ? PAWN_SLUG_WEAPON_STEREO_PAN.enemy : PAWN_SLUG_WEAPON_STEREO_PAN.player;
}

function connectOutput(node, pan = 0) {
  const safePan = Math.max(-1, Math.min(1, Number(pan) || 0));
  if (Math.abs(safePan - PAWN_SLUG_WEAPON_STEREO_PAN.player) < 0.001 && playerWeaponPanner) {
    node.connect(playerWeaponPanner);
    return;
  }
  if (Math.abs(safePan - PAWN_SLUG_WEAPON_STEREO_PAN.enemy) < 0.001 && enemyWeaponPanner) {
    node.connect(enemyWeaponPanner);
    return;
  }
  node.connect(master);
}

function tone({ freq, endFreq = freq, duration = 0.08, gain = 0.12, type = 'triangle', delay = 0, filter = 0, pan = 0 }) {
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
  connectOutput(amp, pan);
  osc.start(now);
  osc.stop(now + duration + 0.025);
}

function noise({ duration = 0.08, gain = 0.12, cutoff = 2200, delay = 0, pan = 0 }) {
  const audio = ensureAudio();
  if (!audio || !master || profileVolume() <= 0.001) return;
  const window = pawnSlugNoiseWindow(duration, Math.random());
  const source = audio.createBufferSource();
  const filter = audio.createBiquadFilter();
  const amp = audio.createGain();
  const now = audio.currentTime + 0.004 + delay;
  source.buffer = ensureSharedNoiseBuffer(audio);
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;
  amp.gain.setValueAtTime(Math.max(0.0001, gain), now);
  amp.gain.exponentialRampToValueAtTime(0.0001, now + window.duration);
  source.connect(filter);
  filter.connect(amp);
  connectOutput(amp, pan);
  source.start(now, window.offset, window.duration);
  source.stop(now + window.duration + 0.01);
}

function playWeaponMechanic(mechanic, scale, pitch = 1, pan = 0) {
  if (mechanic === 'casing') {
    tone({ freq: 1780 * pitch, endFreq: 1220 * pitch, duration: 0.035, gain: 0.035 * scale, type: 'square', delay: 0.045, pan });
    tone({ freq: 980 * pitch, endFreq: 780 * pitch, duration: 0.025, gain: 0.022 * scale, type: 'sine', delay: 0.072, pan });
    return;
  }
  if (mechanic === 'rattle') {
    tone({ freq: 720 * pitch, endFreq: 510 * pitch, duration: 0.028, gain: 0.025 * scale, type: 'square', delay: 0.022, pan });
    tone({ freq: 610 * pitch, endFreq: 430 * pitch, duration: 0.024, gain: 0.022 * scale, type: 'square', delay: 0.048, pan });
    return;
  }
  if (mechanic === 'pump') {
    noise({ duration: 0.038, gain: 0.035 * scale, cutoff: 1800, delay: 0.11, pan });
    tone({ freq: 420 * pitch, endFreq: 250 * pitch, duration: 0.055, gain: 0.045 * scale, type: 'square', delay: 0.118, pan });
    tone({ freq: 260 * pitch, endFreq: 360 * pitch, duration: 0.045, gain: 0.04 * scale, type: 'square', delay: 0.182, pan });
    return;
  }
  if (mechanic === 'tube') {
    tone({ freq: 210 * pitch, endFreq: 145 * pitch, duration: 0.12, gain: 0.045 * scale, type: 'triangle', delay: 0.16, pan });
    tone({ freq: 640 * pitch, endFreq: 390 * pitch, duration: 0.06, gain: 0.025 * scale, type: 'sine', delay: 0.19, pan });
  }
}

export function pawnSlugWeaponSoundProfile(weapon = 'pistol') {
  return PAWN_SLUG_WEAPON_SOUND_PROFILES[weapon] || PAWN_SLUG_WEAPON_SOUND_PROFILES.pistol;
}

export function pawnSlugImpactSoundProfile(type = 'pawn') {
  return PAWN_SLUG_IMPACT_SOUND_PROFILES[type] || PAWN_SLUG_IMPACT_SOUND_PROFILES.pawn;
}

export function playPawnSlugWeaponSfx(weapon = 'pistol', { enemy = false } = {}) {
  const profile = pawnSlugWeaponSoundProfile(weapon);
  const scale = pawnSlugWeaponGainScale(weapon, { enemy });
  const pitch = pawnSlugSoundPitchVariation(Math.random(), { enemy, width: pawnSlugWeaponPitchWidth(weapon) });
  const pan = pawnSlugWeaponStereoPan({ enemy });
  noise({ duration: profile.noise, gain: 0.11 * scale, cutoff: weapon === 'panzerfaust' ? 900 : 3100, pan });
  tone({ freq: profile.body * pitch, endFreq: profile.body * 0.62 * pitch, duration: profile.tail, gain: 0.18 * scale, type: 'sawtooth', pan });
  tone({ freq: profile.crack * pitch, endFreq: profile.crack * 0.72 * pitch, duration: Math.min(0.055, profile.tail), gain: 0.09 * scale, type: 'square', pan });
  if (weapon === 'shotgun') noise({ duration: 0.055, gain: 0.11 * scale, cutoff: 5200, delay: 0.018, pan });
  if (weapon === 'panzerfaust') tone({ freq: 38 * pitch, endFreq: 28 * pitch, duration: 0.28, gain: 0.17 * scale, type: 'triangle', delay: 0.02, pan });
  if (!enemy) playWeaponMechanic(profile.mechanic, scale, pitch, pan);
}

export function playPawnSlugEnemyImpactSfx(type = 'pawn') {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (now - lastImpactAt < 24) return;
  lastImpactAt = now;
  const profile = pawnSlugImpactSoundProfile(type);
  const pitch = pawnSlugSoundPitchVariation(Math.random(), { width: 0.045 });
  noise({ duration: profile.noise, gain: type === 'rook' || type === 'boss' ? 0.115 : 0.085, cutoff: type === 'pawn' ? 1250 : 2600 });
  tone({ freq: profile.body * pitch, endFreq: profile.body * 0.7 * pitch, duration: 0.075, gain: 0.12, type: 'triangle' });
  if (profile.ring) tone({ freq: profile.ring * pitch, endFreq: profile.ring * 0.76 * pitch, duration: type === 'rook' ? 0.12 : 0.075, gain: 0.055, type: 'sine' });
}

export function playPawnSlugEnemyKoSfx(type = 'pawn') {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (now - lastKoAt < 75) return;
  lastKoAt = now;
  const heavy = type === 'rook' || type === 'boss';
  const armored = type === 'knight' || type === 'rook' || type === 'bishop' || type === 'boss';
  const pitch = pawnSlugSoundPitchVariation(Math.random(), { width: 0.04 });
  noise({ duration: heavy ? 0.14 : 0.085, gain: heavy ? 0.14 : 0.09, cutoff: heavy ? 1150 : 1900 });
  tone({ freq: (heavy ? 68 : 104) * pitch, endFreq: (heavy ? 42 : 64) * pitch, duration: heavy ? 0.16 : 0.1, gain: heavy ? 0.16 : 0.11, type: 'triangle' });
  if (armored) {
    tone({ freq: (type === 'boss' ? 360 : 620) * pitch, endFreq: (type === 'boss' ? 190 : 410) * pitch, duration: heavy ? 0.18 : 0.11, gain: 0.07, type: 'square', delay: 0.012 });
    tone({ freq: (type === 'rook' ? 980 : 1260) * pitch, endFreq: 720 * pitch, duration: 0.055, gain: 0.045, type: 'sine', delay: 0.028 });
  }
}

export function playPawnSlugPlayerHitSfx() {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (now - lastPlayerHitAt < 90) return;
  lastPlayerHitAt = now;
  const pitch = pawnSlugSoundPitchVariation(Math.random(), { width: 0.03 });
  noise({ duration: 0.07, gain: 0.105, cutoff: 1500 });
  tone({ freq: 96 * pitch, endFreq: 58 * pitch, duration: 0.105, gain: 0.13, type: 'triangle' });
  tone({ freq: 1180 * pitch, endFreq: 720 * pitch, duration: 0.065, gain: 0.055, type: 'square', delay: 0.01 });
}

export function destroyPawnSlugPremiumSfx() {
  if (!ctx) return;
  try { playerWeaponPanner?.disconnect(); } catch {}
  try { enemyWeaponPanner?.disconnect(); } catch {}
  try { master?.disconnect(); } catch {}
  void ctx.close().catch(() => {});
  ctx = null;
  master = null;
  playerWeaponPanner = null;
  enemyWeaponPanner = null;
  sharedNoiseBuffer = null;
  lastImpactAt = -Infinity;
  lastKoAt = -Infinity;
  lastPlayerHitAt = -Infinity;
}
