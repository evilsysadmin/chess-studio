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
}) {
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();
  const start = ctx.currentTime + delay;
  osc.type = type;
  osc.frequency.value = freq;
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
  filter.Q.value = 1.15;
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

function premiumPieceImpact(kind) {
  if (isFxMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  // Keep the whole gesture extremely short. The board should feel physical,
  // never as if the move is waiting for an audio cue to finish.
  const capture = kind === 'capture';
  const pitch = 1 + microVariation(0.025);
  const level = 1 + microVariation(0.055);

  // A dedicated mini-bus lets the contact, body and tiny room reflection read
  // as one object instead of three unrelated beeps.
  const bus = ctx.createGain();
  bus.gain.value = capture ? 0.92 : 0.78;
  bus.connect(ctx.destination);

  const contactWorked = scheduleSurfaceTick(ctx, bus, {
    gain: (capture ? 0.047 : 0.035) * level,
    duration: capture ? 0.042 : 0.03,
    centerHz: (capture ? 980 : 1280) * pitch,
  });

  // Main body: low, rounded resonance of a substantial chess piece meeting a
  // hard board. Captures sit lower and carry a little more mass.
  scheduleTone(ctx, bus, {
    freq: (capture ? 155 : 205) * pitch,
    gain: (capture ? 0.048 : 0.032) * level,
    duration: capture ? 0.105 : 0.075,
    type: 'triangle',
    attack: 0.0025,
  });

  // Collar/ceramic detail. This is deliberately much quieter than the body;
  // it supplies definition on phone speakers without turning into a plastic click.
  scheduleTone(ctx, bus, {
    freq: (capture ? 520 : 690) * pitch,
    gain: (capture ? 0.017 : 0.014) * level,
    duration: capture ? 0.055 : 0.042,
    type: 'sine',
    delay: 0.004,
    attack: 0.002,
  });

  // Tiny room reflection: enough to place the action inside the War Room,
  // short enough not to smear rapid play or stack into audible reverb.
  scheduleTone(ctx, bus, {
    freq: (capture ? 118 : 168) * pitch,
    gain: (capture ? 0.012 : 0.0085) * level,
    duration: capture ? 0.105 : 0.08,
    type: 'sine',
    delay: capture ? 0.022 : 0.018,
    attack: 0.004,
  });

  // Very old/minimal Web Audio implementations may lack noise-buffer support.
  // Preserve an audible tactile cue rather than failing silently.
  if (!contactWorked) {
    scheduleTone(ctx, bus, {
      freq: (capture ? 900 : 1180) * pitch,
      gain: (capture ? 0.012 : 0.01) * level,
      duration: 0.025,
      type: 'square',
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
