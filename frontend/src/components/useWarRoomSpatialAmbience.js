import { useEffect, useState } from 'react';
import { getAudioContext, resumeAudioContext } from '../audioContext.js';
import { isFxMuted } from '../soundPreferences.js';
import { USER_PREFERENCES_CHANGED_EVENT } from '../userPreferences.js';
import { resolveWarRoomLocalAtmosphere } from './WarRoomLocalAtmosphere.js';

export const WAR_ROOM_SPATIAL_AMBIENCE_VERSION = 'war-room-spatial-ambience-v1';

export function warRoomSpatialMixForAtmosphere(atmosphere = {}) {
  const weather = String(atmosphere.weather || 'sunny');
  const phase = String(atmosphere.phase || 'day');
  return Object.freeze({
    fire: 0.0105,
    room: phase === 'night' ? 0.0038 : 0.0032,
    rain: weather === 'rain' ? 0.008 : 0,
    wind: weather === 'cloudy' ? 0.0048 : weather === 'snow' ? 0.0036 : weather === 'rain' ? 0.0028 : 0.0018,
    rareEventMinMs: 32_000,
    rareEventMaxMs: 68_000,
  });
}

function makeNoiseBuffer(context, seconds = 2.4) {
  const length = Math.max(1, Math.floor(context.sampleRate * seconds));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let previous = 0;
  for (let index = 0; index < data.length; index += 1) {
    const white = Math.random() * 2 - 1;
    previous = previous * 0.82 + white * 0.18;
    data[index] = previous;
  }
  return buffer;
}

function createStereoChain(context, { gainValue, pan = 0, filterType = 'lowpass', frequency = 900, q = 0.7 }) {
  const gain = context.createGain();
  gain.gain.value = gainValue;
  const filter = context.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = frequency;
  filter.Q.value = q;
  const panner = typeof context.createStereoPanner === 'function' ? context.createStereoPanner() : null;
  if (panner) panner.pan.value = Math.max(-1, Math.min(1, pan));
  filter.connect(gain);
  if (panner) {
    gain.connect(panner);
    return { input: filter, output: panner, nodes: [filter, gain, panner] };
  }
  return { input: filter, output: gain, nodes: [filter, gain] };
}

function startNoiseLoop(context, master, buffer, options) {
  if (!(options.gainValue > 0)) return null;
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const chain = createStereoChain(context, options);
  source.connect(chain.input);
  chain.output.connect(master);
  source.start();
  return { source, nodes: chain.nodes };
}

function playRareRoomTick(context, master, kind, pan) {
  if (context.state === 'closed') return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const panner = typeof context.createStereoPanner === 'function' ? context.createStereoPanner() : null;
  const now = context.currentTime;
  const metal = kind === 'metal';
  oscillator.type = metal ? 'triangle' : 'sine';
  oscillator.frequency.setValueAtTime(metal ? 760 : 116, now);
  oscillator.frequency.exponentialRampToValueAtTime(metal ? 430 : 78, now + (metal ? 0.11 : 0.28));
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(metal ? 0.0022 : 0.0018, now + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + (metal ? 0.16 : 0.34));
  if (panner) panner.pan.value = Math.max(-1, Math.min(1, pan));
  oscillator.connect(gain);
  if (panner) {
    gain.connect(panner);
    panner.connect(master);
  } else {
    gain.connect(master);
  }
  oscillator.start(now);
  oscillator.stop(now + (metal ? 0.18 : 0.36));
  oscillator.onended = () => {
    try { oscillator.disconnect(); } catch { /* already disconnected */ }
    try { gain.disconnect(); } catch { /* already disconnected */ }
    try { panner?.disconnect(); } catch { /* already disconnected */ }
  };
}

export function startWarRoomSpatialAmbience({ context, atmosphere = resolveWarRoomLocalAtmosphere(), random = Math.random } = {}) {
  if (!context || context.state === 'closed') return () => {};
  const mix = warRoomSpatialMixForAtmosphere(atmosphere);
  const master = context.createGain();
  master.gain.value = 1;
  master.connect(context.destination);

  const noiseBuffer = makeNoiseBuffer(context);
  const loops = [
    startNoiseLoop(context, master, noiseBuffer, {
      gainValue: mix.fire,
      pan: -0.62,
      filterType: 'bandpass',
      frequency: 520,
      q: 0.62,
    }),
    startNoiseLoop(context, master, noiseBuffer, {
      gainValue: mix.room,
      pan: 0,
      filterType: 'lowpass',
      frequency: 180,
      q: 0.45,
    }),
    startNoiseLoop(context, master, noiseBuffer, {
      gainValue: mix.rain,
      pan: 0.72,
      filterType: 'highpass',
      frequency: 1850,
      q: 0.55,
    }),
    startNoiseLoop(context, master, noiseBuffer, {
      gainValue: mix.wind,
      pan: 0.58,
      filterType: 'bandpass',
      frequency: 250,
      q: 0.5,
    }),
  ].filter(Boolean);

  let disposed = false;
  let rareTimer = 0;
  const scheduleRareTick = () => {
    if (disposed || typeof window === 'undefined') return;
    const span = mix.rareEventMaxMs - mix.rareEventMinMs;
    const delay = mix.rareEventMinMs + Math.floor(Math.max(0, Math.min(1, random())) * span);
    rareTimer = window.setTimeout(() => {
      if (disposed) return;
      const roll = Math.max(0, Math.min(1, random()));
      playRareRoomTick(context, master, roll > 0.72 ? 'metal' : 'wood', roll > 0.5 ? 0.48 : -0.35);
      scheduleRareTick();
    }, delay);
  };
  scheduleRareTick();

  return () => {
    disposed = true;
    if (rareTimer && typeof window !== 'undefined') window.clearTimeout(rareTimer);
    for (const loop of loops) {
      try { loop.source.stop(); } catch { /* source already stopped */ }
      try { loop.source.disconnect(); } catch { /* source already disconnected */ }
      for (const node of loop.nodes) {
        try { node.disconnect(); } catch { /* node already disconnected */ }
      }
    }
    try { master.disconnect(); } catch { /* already disconnected */ }
  };
}

export default function useWarRoomSpatialAmbience({ enabled }) {
  const [preferenceRevision, setPreferenceRevision] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const refresh = () => setPreferenceRevision((value) => value + 1);
    window.addEventListener(USER_PREFERENCES_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(USER_PREFERENCES_CHANGED_EVENT, refresh);
  }, []);

  useEffect(() => {
    if (!enabled || isFxMuted()) return undefined;
    const context = getAudioContext();
    if (!context) return undefined;
    void resumeAudioContext();
    return startWarRoomSpatialAmbience({ context, atmosphere: resolveWarRoomLocalAtmosphere() });
  }, [enabled, preferenceRevision]);
}
