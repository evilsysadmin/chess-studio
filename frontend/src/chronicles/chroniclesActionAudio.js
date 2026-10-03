import { getAudioContext } from '../audioContext.js';
import { isFxMuted } from '../soundPreferences.js';
import { chroniclesMapForState } from './chroniclesMapCatalog.js';

function actionType(action) {
  return typeof action === 'string' ? action : action?.type;
}

function totalPartyHp(state) {
  return (state?.party || []).reduce((sum, member) => sum + Math.max(0, Number(member?.hp || 0)), 0);
}

function enemyHpSnapshot(state) {
  const map = state ? chroniclesMapForState(state) : null;
  return (map?.enemies || []).map((enemy) => ({
    id: enemy.id,
    hp: Math.max(0, Number(state?.[enemy.hpKey] || 0)),
  }));
}

export function chroniclesActionAudioCue(previous, next, action) {
  if (!previous || !next) return null;
  const type = actionType(action);
  if (type === 'turn-left' || type === 'turn-right') return 'turn';

  if (type === 'forward' || type === 'backward') {
    if (next.phase === 'escaped' && previous.phase !== 'escaped') return 'exit';
    return previous.x !== next.x || previous.y !== next.y ? 'step' : 'blocked';
  }

  if (type !== 'attack') return null;

  const beforeEnemies = enemyHpSnapshot(previous);
  const afterById = new Map(enemyHpSnapshot(next).map((enemy) => [enemy.id, enemy.hp]));
  const damaged = beforeEnemies.filter((enemy) => (afterById.get(enemy.id) ?? enemy.hp) < enemy.hp);
  if (!damaged.length) return 'miss';

  const defeated = damaged.some((enemy) => enemy.hp > 0 && (afterById.get(enemy.id) ?? enemy.hp) === 0);
  if (defeated) return 'defeat';
  if (totalPartyHp(next) < totalPartyHp(previous)) return 'retaliation';
  return 'hit';
}

function connectTone(ctx, destination, { frequency, duration, gain, type = 'triangle', delay = 0, endFrequency = null }) {
  if (typeof ctx.createOscillator !== 'function' || typeof ctx.createGain !== 'function') return;
  const oscillator = ctx.createOscillator();
  const level = ctx.createGain();
  const start = ctx.currentTime + delay;
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration);
  level.gain.setValueAtTime(0.0001, start);
  level.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), start + Math.min(0.008, duration * 0.3));
  level.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(level);
  level.connect(destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function connectNoise(ctx, destination, { duration, gain, centerHz, delay = 0, type = 'bandpass' }) {
  if (
    typeof ctx.createBuffer !== 'function'
    || typeof ctx.createBufferSource !== 'function'
    || typeof ctx.createBiquadFilter !== 'function'
    || typeof ctx.createGain !== 'function'
  ) return;
  const frames = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) {
    const envelope = 1 - index / data.length;
    data[index] = (Math.random() * 2 - 1) * envelope;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = centerHz;
  filter.Q.value = type === 'bandpass' ? 0.8 : 0.35;
  const level = ctx.createGain();
  const start = ctx.currentTime + delay;
  level.gain.setValueAtTime(Math.max(0.0002, gain), start);
  level.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter);
  filter.connect(level);
  level.connect(destination);
  source.start(start);
  source.stop(start + duration + 0.02);
}

function playCue(cue) {
  if (!cue || isFxMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume?.().catch(() => {});

  const bus = ctx.createGain();
  bus.gain.value = 0.82;
  bus.connect(ctx.destination);

  if (cue === 'step') {
    connectNoise(ctx, bus, { duration: 0.055, gain: 0.024, centerHz: 430 });
    connectTone(ctx, bus, { frequency: 92, endFrequency: 74, duration: 0.085, gain: 0.032 });
    return;
  }
  if (cue === 'turn') {
    connectNoise(ctx, bus, { duration: 0.045, gain: 0.011, centerHz: 760, type: 'lowpass' });
    connectTone(ctx, bus, { frequency: 126, endFrequency: 108, duration: 0.05, gain: 0.01 });
    return;
  }
  if (cue === 'blocked') {
    connectNoise(ctx, bus, { duration: 0.035, gain: 0.025, centerHz: 520 });
    connectTone(ctx, bus, { frequency: 88, endFrequency: 61, duration: 0.12, gain: 0.046 });
    return;
  }
  if (cue === 'miss') {
    connectNoise(ctx, bus, { duration: 0.09, gain: 0.018, centerHz: 1350 });
    connectTone(ctx, bus, { frequency: 210, endFrequency: 155, duration: 0.07, gain: 0.014 });
    return;
  }
  if (cue === 'exit') {
    connectTone(ctx, bus, { frequency: 196, endFrequency: 246, duration: 0.18, gain: 0.026 });
    connectTone(ctx, bus, { frequency: 294, endFrequency: 370, duration: 0.22, gain: 0.018, delay: 0.055 });
    return;
  }

  connectNoise(ctx, bus, { duration: 0.045, gain: cue === 'defeat' ? 0.045 : 0.034, centerHz: 780 });
  connectTone(ctx, bus, {
    frequency: cue === 'defeat' ? 132 : 158,
    endFrequency: cue === 'defeat' ? 72 : 112,
    duration: cue === 'defeat' ? 0.2 : 0.13,
    gain: cue === 'defeat' ? 0.052 : 0.041,
  });
  if (cue === 'retaliation') {
    connectNoise(ctx, bus, { duration: 0.04, gain: 0.027, centerHz: 610, delay: 0.085 });
    connectTone(ctx, bus, { frequency: 104, endFrequency: 72, duration: 0.11, gain: 0.038, delay: 0.082 });
  } else if (cue === 'defeat') {
    connectTone(ctx, bus, { frequency: 246, endFrequency: 164, duration: 0.16, gain: 0.018, delay: 0.035 });
  }
}

export function playChroniclesActionSound(previous, next, action) {
  playCue(chroniclesActionAudioCue(previous, next, action));
}
