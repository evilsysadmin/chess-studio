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

// Clic seco al mover una pieza.
export function playMoveSound() {
  beep({ freq: 520, duration: 0.09, type: 'triangle', gain: 0.05 });
}

// Golpe más grave al capturar, con un segundo "impacto" superpuesto.
export function playCaptureSound() {
  beep({ freq: 220, duration: 0.14, type: 'square', gain: 0.05 });
  beep({ freq: 140, duration: 0.16, type: 'square', gain: 0.045, delay: 0.02 });
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
