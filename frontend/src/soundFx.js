import { getAudioContext } from './audioContext.js';
import { isFxMuted } from './soundPreferences.js';

function beep({ freq, duration, type = 'sine', gain = 0.06, delay = 0 }) {
  if (isFxMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const start = ctx.currentTime + delay;

  gainNode.gain.setValueAtTime(0, start);
  gainNode.gain.linearRampToValueAtTime(gain, start + 0.008);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(gainNode);
  gainNode.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function microVariation(amount = 1) {
  return (Math.random() * 2 - 1) * amount;
}

function scheduleTone(ctx, destination, {
  freq,
  gain,
  duration,
  type = 'triangle',
  delay = 0,
  attack = 0.003,
  settle = 0.965,
}) {
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();
  const start = ctx.currentTime + delay;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (settle && settle !== 1) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * settle), start + duration);
  }
  gainNode.gain.setValueAtTime(0.0001, start);
  gainNode.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), start + attack);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gainNode);
  gainNode.connect(destination);
  osc.start(start);
  osc.stop(start + duration + 0.015);
}

function scheduleSurfaceTick(ctx, destination, {
  gain,
  duration,
  centerHz,
  delay = 0,
  q = 1.15,
}) {
  if (
    typeof ctx.createBuffer !== 'function'
    || typeof ctx.createBufferSource !== 'function'
    || typeof ctx.createBiquadFilter !== 'function'
  ) return false;

  const frames = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) {
    // A very short, decaying noise transient gives the contact a physical
    // wood/stone character without shipping another runtime asset.
    const envelope = 1 - index / data.length;
    data[index] = (Math.random() * 2 - 1) * envelope;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = centerHz;
  filter.Q.value = q;
  const gainNode = ctx.createGain();
  const start = ctx.currentTime + delay;
  gainNode.gain.setValueAtTime(Math.max(0.0001, gain), start);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  source.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(destination);
  source.start(start);
  source.stop(start + duration + 0.01);
  return true;
}

function scheduleSurfaceFriction(ctx, destination, {
  gain,
  duration,
  cutoffHz,
  delay = 0,
}) {
  if (
    typeof ctx.createBuffer !== 'function'
    || typeof ctx.createBufferSource !== 'function'
    || typeof ctx.createBiquadFilter !== 'function'
  ) return false;

  const frames = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) {
    const phase = index / data.length;
    const envelope = Math.sin(Math.PI * phase) * (1 - phase * 0.65);
    data[index] = (Math.random() * 2 - 1) * envelope;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = cutoffHz;
  filter.Q.value = 0.45;

  const gainNode = ctx.createGain();
  const start = ctx.currentTime + delay;
  gainNode.gain.setValueAtTime(0.0001, start);
  gainNode.gain.linearRampToValueAtTime(Math.max(0.0002, gain), start + Math.min(0.008, duration * 0.3));
  gainNode.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  source.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(destination);
  source.start(start);
  source.stop(start + duration + 0.01);
  return true;
}

function createPremiumImpactBus(ctx, { capture }) {
  const input = ctx.createGain();
  input.gain.value = capture ? 0.98 : 0.86;

  let tail = input;

  // A gentle high cut removes the last trace of procedural fizz while keeping
  // enough attack for phone speakers. This is tone shaping, not audible reverb.
  if (typeof ctx.createBiquadFilter === 'function') {
    const tone = ctx.createBiquadFilter();
    if (tone) {
      tone.type = 'lowpass';
      tone.frequency.value = capture ? 4700 : 5200;
      tone.Q.value = 0.35;
      tail.connect(tone);
      tail = tone;
    }
  }

  // Glue the layered contact into one object. Keep the compressor subtle:
  // transient still leads, but body/friction no longer feel like separate events.
  if (typeof ctx.createDynamicsCompressor === 'function') {
    const compressor = ctx.createDynamicsCompressor();
    if (compressor) {
      compressor.threshold.value = -22;
      compressor.knee.value = 16;
      compressor.ratio.value = capture ? 2.2 : 1.9;
      compressor.attack.value = 0.006;
      compressor.release.value = capture ? 0.1 : 0.085;
      tail.connect(compressor);
      tail = compressor;
    }
  }

  const output = ctx.createGain();
  output.gain.value = capture ? 1.12 : 1.06;
  tail.connect(output);
  output.connect(ctx.destination);
  return input;
}

function premiumPieceImpact(kind) {
  if (isFxMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  // Premium pass: the ear should read material/contact first and pitch second.
  // Keep the full gesture short so rapid play never accumulates a tail.
  const capture = kind === 'capture';
  const pitch = 1 + microVariation(0.018);
  const level = 1 + microVariation(0.045);

  const bus = createPremiumImpactBus(ctx, { capture });

  // Hard contact between base/plinth and board: a bright, very short transient.
  const contactWorked = scheduleSurfaceTick(ctx, bus, {
    gain: (capture ? 0.043 : 0.034) * level,
    duration: capture ? 0.034 : 0.026,
    centerHz: (capture ? 1120 : 1450) * pitch,
    q: capture ? 1.05 : 1.2,
  });

  // Lower material knock gives the impact actual mass on decent speakers while
  // remaining audible on phones. This replaces some of the old tonal body.
  const bodyTickWorked = scheduleSurfaceTick(ctx, bus, {
    gain: (capture ? 0.031 : 0.0225) * level,
    duration: capture ? 0.085 : 0.068,
    centerHz: (capture ? 315 : 390) * pitch,
    delay: 0.0015,
    q: 0.8,
  });

  // Captures are physically two gestures: the taken piece leaves, then the
  // attacker settles. A restrained second contact reads as capture without
  // becoming a UI double-click.
  if (capture) {
    scheduleSurfaceTick(ctx, bus, {
      gain: 0.017 * level,
      duration: 0.025,
      centerHz: 760 * pitch,
      delay: 0.014,
      q: 0.95,
    });
  }

  // A tiny base-on-board settle sells weight better than another pitched layer.
  // It is intentionally almost subliminal; on captures it is a little rougher
  // because one piece leaves before the attacking piece seats.
  const frictionWorked = scheduleSurfaceFriction(ctx, bus, {
    gain: (capture ? 0.0095 : 0.0064) * level,
    duration: capture ? 0.046 : 0.034,
    cutoffHz: (capture ? 980 : 1180) * pitch,
    delay: capture ? 0.008 : 0.006,
  });

  // Rounded residual resonance. A tiny downward settle avoids the static,
  // musical oscillator quality of the previous implementation.
  scheduleTone(ctx, bus, {
    freq: (capture ? 142 : 188) * pitch,
    gain: (capture ? 0.036 : 0.026) * level,
    duration: capture ? 0.115 : 0.085,
    type: 'triangle',
    attack: 0.002,
    settle: capture ? 0.91 : 0.935,
  });

  // Quiet collar/ceramic detail keeps definition on small speakers.
  scheduleTone(ctx, bus, {
    freq: (capture ? 470 : 610) * pitch,
    gain: (capture ? 0.009 : 0.0075) * level,
    duration: capture ? 0.041 : 0.033,
    type: 'sine',
    delay: 0.003,
    attack: 0.0015,
    settle: 0.94,
  });

  // Very short low reflection places the event in the room without audible
  // reverb build-up during blitz.
  scheduleTone(ctx, bus, {
    freq: (capture ? 102 : 145) * pitch,
    gain: (capture ? 0.0105 : 0.0075) * level,
    duration: capture ? 0.13 : 0.095,
    type: 'sine',
    delay: capture ? 0.024 : 0.019,
    attack: 0.003,
    settle: 0.9,
  });

  // Minimal Web Audio fallback: if buffer noise is unavailable, retain a short
  // tactile cue. Do not recreate the full premium stack with square-wave beeps.
  if (!contactWorked || !bodyTickWorked || !frictionWorked) {
    scheduleTone(ctx, bus, {
      freq: (capture ? 820 : 1060) * pitch,
      gain: (capture ? 0.009 : 0.007) * level,
      duration: 0.02,
      type: 'square',
      settle: 0.9,
    });
  }
}

export function playMoveSound() {
  premiumPieceImpact('move');
}

export function playCaptureSound() {
  premiumPieceImpact('capture');
}

export function playSuccessSound() {
  [523, 659, 784].forEach((freq, i) => beep({ freq, duration: 0.18, type: 'triangle', gain: 0.05, delay: i * 0.09 }));
}

export function playMissSound() {
  beep({ freq: 260, duration: 0.1, type: 'sine', gain: 0.035 });
  beep({ freq: 180, duration: 0.14, type: 'sine', gain: 0.03, delay: 0.06 });
}

export function playTimePressureSound() {
  beep({ freq: 880, duration: 0.07, type: 'sine', gain: 0.028 });
  beep({ freq: 660, duration: 0.09, type: 'sine', gain: 0.025, delay: 0.08 });
}

export function playIllegalMoveSound() {
  beep({ freq: 980, duration: 0.055, type: 'square', gain: 0.032 });
  beep({ freq: 720, duration: 0.075, type: 'square', gain: 0.03, delay: 0.065 });
}

export function playNoteworthySound(event, actor = 'human') {
  const type = event?.type;
  if (!type) return;
  if (['MISSED_MATE', 'ALLOWED_MATE', 'QUEEN_EN_PRISE_TO_PAWN', 'STALEMATE_BLUNDER'].includes(type)) {
    beep({ freq: 155, duration: 0.22, type: 'sawtooth', gain: 0.045 });
    beep({ freq: 103, duration: 0.3, type: 'square', gain: 0.035, delay: 0.1 });
    return;
  }
  if (['PAWN_TAKES_QUEEN', 'QUEEN_WIN', 'KNIGHT_FORK', 'PAWN_FORK', 'SKEWER', 'DISCOVERED_ATTACK'].includes(type)) {
    const up = actor === 'human';
    const notes = up ? [392, 523, 659] : [330, 247, 196];
    notes.forEach((freq, i) => beep({ freq, duration: 0.12, type: 'triangle', gain: 0.035, delay: i * 0.055 }));
    return;
  }
  if (['MATE_FOUND', 'PROMOTION', 'GREAT_SACRIFICE'].includes(type)) {
    [440, 554, 659, 880].forEach((freq, i) => beep({ freq, duration: 0.16, type: 'triangle', gain: 0.04, delay: i * 0.06 }));
  }
}
