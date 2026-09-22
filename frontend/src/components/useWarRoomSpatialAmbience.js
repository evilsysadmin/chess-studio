import { useEffect, useState } from 'react';
import { getAudioContext, resumeAudioContext } from '../audioContext.js';
import { PROFILE_CHANGED_EVENT } from '../profileKeys.js';
import { isFxMuted } from '../soundPreferences.js';
import { USER_PREFERENCES_CHANGED_EVENT } from '../userPreferences.js';
import {
  WAR_ROOM_AMBIENCE_CHANGED_EVENT,
  isWarRoomAmbienceMuted,
} from '../warRoomAmbiencePreferences.js';
import { resolveWarRoomLocalAtmosphere } from './WarRoomLocalAtmosphere.js';

export const WAR_ROOM_WEATHER_IDLE_GAIN = 0;
export const WAR_ROOM_WEATHER_WINDOW_HOVER_GAIN = 1;
export const WAR_ROOM_WEATHER_WINDOW_INSET_X = 0.3;
export const WAR_ROOM_WEATHER_WINDOW_INSET_Y = 0.18;

export function warRoomSpatialMixForAtmosphere(atmosphere = {}) {
  const weather = String(atmosphere.weather || 'sunny');
  const phase = String(atmosphere.phase || 'day');
  return Object.freeze({
    fire: 0.0105,
    room: phase === 'night' ? 0.0038 : 0.0032,
    rain: weather === 'rain' ? 0.0016 : 0,
    wind: weather === 'cloudy' ? 0.0009 : weather === 'snow' ? 0.0007 : weather === 'rain' ? 0.00055 : 0.00035,
    rareEventMinMs: 32_000,
    rareEventMaxMs: 68_000,
  });
}

export function warRoomAmbienceShouldPlay({ enabled, fxMuted, ambienceMuted }) {
  return Boolean(enabled) && !fxMuted && !ambienceMuted;
}

export function warRoomWeatherGainForWindowHover(active) {
  return active ? WAR_ROOM_WEATHER_WINDOW_HOVER_GAIN : WAR_ROOM_WEATHER_IDLE_GAIN;
}

export function warRoomInteriorToneSpecs(mix = {}) {
  const fire = Math.max(0, Number(mix.fire) || 0);
  const room = Math.max(0, Number(mix.room) || 0);
  return Object.freeze([
    Object.freeze({
      type: 'triangle',
      frequency: 86,
      gainValue: Math.min(0.00065, fire * 0.06),
      pan: -0.62,
    }),
    Object.freeze({
      type: 'sine',
      frequency: 54,
      gainValue: Math.min(0.00085, room * 0.22),
      pan: 0,
    }),
  ].filter((spec) => spec.gainValue > 0));
}

export function warRoomWeatherLoopSpecs(mix = {}, active = false) {
  if (!active) return Object.freeze([]);
  return Object.freeze([
    Object.freeze({
      gainValue: Number(mix.rain) || 0,
      pan: 0.72,
      filterType: 'highpass',
      frequency: 1850,
      q: 0.55,
    }),
    Object.freeze({
      gainValue: Number(mix.wind) || 0,
      pan: 0.58,
      filterType: 'bandpass',
      frequency: 250,
      q: 0.5,
    }),
  ].filter((spec) => spec.gainValue > 0));
}

export function warRoomWeatherPointInHitbox({ clientX, clientY, rect, hitbox }) {
  const values = String(hitbox || '').split(',').map(Number);
  if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) return false;
  const width = Number(rect?.width);
  const height = Number(rect?.height);
  if (!(width > 0) || !(height > 0)) return false;
  const x = (Number(clientX) - Number(rect.left || 0)) / width;
  const y = (Number(clientY) - Number(rect.top || 0)) / height;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const [minX, minY, maxX, maxY] = values;
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  if (!(spanX > 0) || !(spanY > 0) || spanX > 0.34 || spanY > 0.72) return false;

  // The projected box belongs to the complete 3D window assembly (frame, trim,
  // precipitation layers, etc.), not only the pane the player can actually see.
  // Keep weather audio inside the central glass area so a pointer beside the
  // window can never make rain/wind audible.
  const insetX = spanX * WAR_ROOM_WEATHER_WINDOW_INSET_X;
  const insetY = spanY * WAR_ROOM_WEATHER_WINDOW_INSET_Y;
  return x >= minX + insetX
    && x <= maxX - insetX
    && y >= minY + insetY
    && y <= maxY - insetY;
}

export function warRoomWeatherPointerOutShouldMute(event) {
  return Boolean(event?.target?.classList?.contains?.('board3d-main-canvas'))
    || event?.relatedTarget == null;
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

function stopNoiseLoop(loop) {
  if (!loop) return;
  try { loop.source.stop(); } catch { /* source already stopped */ }
  try { loop.source.disconnect(); } catch { /* source already disconnected */ }
  for (const node of loop.nodes) {
    try { node.disconnect(); } catch { /* node already disconnected */ }
  }
}

function startToneLoop(context, master, { type = 'sine', frequency = 55, gainValue = 0, pan = 0 }) {
  if (!(gainValue > 0)) return null;
  const source = context.createOscillator();
  const gain = context.createGain();
  const panner = typeof context.createStereoPanner === 'function' ? context.createStereoPanner() : null;
  source.type = type;
  source.frequency.value = frequency;
  gain.gain.value = gainValue;
  if (panner) panner.pan.value = Math.max(-1, Math.min(1, pan));
  source.connect(gain);
  if (panner) {
    gain.connect(panner);
    panner.connect(master);
  } else {
    gain.connect(master);
  }
  source.start();
  return { source, nodes: [gain, panner].filter(Boolean) };
}

function stopToneLoop(loop) {
  if (!loop) return;
  try { loop.source.stop(); } catch { /* source already stopped */ }
  try { loop.source.disconnect(); } catch { /* source already disconnected */ }
  for (const node of loop.nodes) {
    try { node.disconnect(); } catch { /* node already disconnected */ }
  }
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

function setWeatherPresence(context, weatherBus, active) {
  const target = warRoomWeatherGainForWindowHover(active);
  const now = Number(context.currentTime) || 0;
  const gain = weatherBus?.gain;
  if (!gain) return;
  if (typeof gain.cancelScheduledValues === 'function') gain.cancelScheduledValues(now);
  if (!active) {
    if (typeof gain.setValueAtTime === 'function') gain.setValueAtTime(WAR_ROOM_WEATHER_IDLE_GAIN, now);
    else gain.value = WAR_ROOM_WEATHER_IDLE_GAIN;
    return;
  }
  if (typeof gain.setTargetAtTime === 'function') {
    gain.setTargetAtTime(target, now, 0.08);
    return;
  }
  gain.value = target;
}

function eventHoversWeatherWindow(event) {
  const canvas = event?.target;
  if (!canvas?.classList?.contains?.('board3d-main-canvas')) return false;
  return warRoomWeatherPointInHitbox({
    clientX: event.clientX,
    clientY: event.clientY,
    rect: canvas.getBoundingClientRect?.(),
    hitbox: canvas.dataset?.warRoomWeatherWindowHitbox,
  });
}

export function startWarRoomSpatialAmbience({ context, atmosphere = resolveWarRoomLocalAtmosphere(), random = Math.random } = {}) {
  if (!context || context.state === 'closed') return () => {};
  const mix = warRoomSpatialMixForAtmosphere(atmosphere);
  const master = context.createGain();
  master.gain.value = 1;
  master.connect(context.destination);
  const weatherBus = context.createGain();
  weatherBus.gain.value = WAR_ROOM_WEATHER_IDLE_GAIN;

  // Broadband noise is reserved exclusively for weather. The old fire/room
  // noise floor was always audible and, especially on phone speakers, sounded
  // indistinguishable from distant rain even while the weather bus was silent.
  const interiorToneLoops = warRoomInteriorToneSpecs(mix)
    .map((spec) => startToneLoop(context, master, spec))
    .filter(Boolean);
  const noiseBuffer = makeNoiseBuffer(context);

  let disposed = false;
  let rareTimer = 0;
  let weatherWindowHovered = false;
  let weatherBusConnected = false;
  let weatherLoops = [];

  const stopWeatherLoops = () => {
    for (const loop of weatherLoops) stopNoiseLoop(loop);
    weatherLoops = [];
  };

  const startWeatherLoops = () => {
    stopWeatherLoops();
    weatherLoops = warRoomWeatherLoopSpecs(mix, true)
      .map((spec) => startNoiseLoop(context, weatherBus, noiseBuffer, spec))
      .filter(Boolean);
  };

  const applyWeatherWindowHover = (active) => {
    if (disposed || weatherWindowHovered === active) return;
    weatherWindowHovered = active;
    if (active) {
      if (!weatherBusConnected) {
        weatherBus.connect(master);
        weatherBusConnected = true;
      }
      setWeatherPresence(context, weatherBus, true);
      startWeatherLoops();
      return;
    }

    setWeatherPresence(context, weatherBus, false);
    stopWeatherLoops();
    if (weatherBusConnected) {
      try { weatherBus.disconnect(); } catch { /* already disconnected */ }
      weatherBusConnected = false;
    }
  };
  const handlePointerMove = (event) => {
    if (event?.pointerType && event.pointerType !== 'mouse') {
      applyWeatherWindowHover(false);
      return;
    }
    applyWeatherWindowHover(eventHoversWeatherWindow(event));
  };
  const handlePointerOut = (event) => {
    if (warRoomWeatherPointerOutShouldMute(event)) applyWeatherWindowHover(false);
  };
  const handleVisibilityChange = () => {
    if (typeof document !== 'undefined' && document.hidden) applyWeatherWindowHover(false);
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerout', handlePointerOut, { passive: true });
    window.addEventListener('blur', handlePointerOut);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', handleVisibilityChange);
  }

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
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerout', handlePointerOut);
      window.removeEventListener('blur', handlePointerOut);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
    stopWeatherLoops();
    for (const loop of interiorToneLoops) stopToneLoop(loop);
    try { weatherBus.disconnect(); } catch { /* already disconnected */ }
    try { master.disconnect(); } catch { /* already disconnected */ }
  };
}

export default function useWarRoomSpatialAmbience({ enabled }) {
  const [preferenceRevision, setPreferenceRevision] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const refresh = () => setPreferenceRevision((value) => value + 1);
    window.addEventListener(USER_PREFERENCES_CHANGED_EVENT, refresh);
    window.addEventListener(PROFILE_CHANGED_EVENT, refresh);
    window.addEventListener(WAR_ROOM_AMBIENCE_CHANGED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(USER_PREFERENCES_CHANGED_EVENT, refresh);
      window.removeEventListener(PROFILE_CHANGED_EVENT, refresh);
      window.removeEventListener(WAR_ROOM_AMBIENCE_CHANGED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  useEffect(() => {
    if (!warRoomAmbienceShouldPlay({
      enabled,
      fxMuted: isFxMuted(),
      ambienceMuted: isWarRoomAmbienceMuted(),
    })) return undefined;
    const context = getAudioContext();
    if (!context) return undefined;
    void resumeAudioContext();
    return startWarRoomSpatialAmbience({ context, atmosphere: resolveWarRoomLocalAtmosphere() });
  }, [enabled, preferenceRevision]);
}
