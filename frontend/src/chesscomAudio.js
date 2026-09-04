import { duckAmbientMusic } from './sound.js';
import { getAmbientVolume, isFxMuted, isMusicMuted } from './soundPreferences.js';

function noopAudio() {
  return { arm() {}, play() {}, setThreat() {}, destroy() {} };
}

export function createChesscomAudio() {
  if (typeof window === 'undefined') return noopAudio();
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return noopAudio();

  let ctx = null;
  let master = null;
  let musicBus = null;
  let fxBus = null;
  let scoreTimer = null;
  let scoreStarted = false;
  let threat = 0;
  let ducked = false;

  function ensure() {
    if (ctx) return ctx;
    ctx = new AudioCtx();
    master = ctx.createGain();
    musicBus = ctx.createGain();
    fxBus = ctx.createGain();
    master.gain.value = 0.72;
    musicBus.gain.value = isMusicMuted() ? 0 : 0.075 * getAmbientVolume();
    fxBus.gain.value = isFxMuted() ? 0 : 0.18;
    musicBus.connect(master);
    fxBus.connect(master);
    master.connect(ctx.destination);
    return ctx;
  }

  function resume() {
    const audio = ensure();
    if (audio.state === 'suspended') void audio.resume().catch(() => {});
    return audio;
  }

  function oscillator({ frequency, duration, type = 'sine', gain = 0.12, destination = fxBus, slide = 0, delay = 0 }) {
    const audio = resume();
    const now = audio.currentTime + 0.006 + delay;
    const osc = audio.createOscillator();
    const env = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, frequency), now);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, frequency + slide), now + duration);
    env.gain.setValueAtTime(Math.max(0.0001, gain), now);
    env.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(env);
    env.connect(destination || fxBus);
    osc.start(now);
    osc.stop(now + duration + 0.03);
  }

  function noise(duration = 0.1, gainValue = 0.1, highpass = 0) {
    const audio = resume();
    const length = Math.max(1, Math.floor(audio.sampleRate * duration));
    const buffer = audio.createBuffer(1, length, audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = audio.createBufferSource();
    const env = audio.createGain();
    source.buffer = buffer;
    env.gain.value = gainValue;
    source.connect(env);
    if (highpass) {
      const filter = audio.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = highpass;
      env.connect(filter);
      filter.connect(fxBus);
    } else env.connect(fxBus);
    source.start();
  }

  function scorePulse() {
    if (!ctx || !scoreStarted || isMusicMuted()) return;
    musicBus.gain.value = 0.075 * getAmbientVolume();
    const base = threat > 0.55 ? 54 : 46;
    oscillator({ frequency:base, duration:1.8, type:'sine', gain:0.11, destination:musicBus, slide:-4 });
    oscillator({ frequency:base * 2, duration:.55, type:'triangle', gain:0.025 + threat * .018, destination:musicBus, delay:.18 });
    if (threat > .2) oscillator({ frequency:82, duration:.12, type:'square', gain:.015 + threat * .014, destination:musicBus, delay:.72 });
    scoreTimer = window.setTimeout(scorePulse, threat > .55 ? 1900 : 2550);
  }

  function arm() {
    resume();
    if (scoreStarted) return;
    scoreStarted = true;
    if (!ducked) {
      duckAmbientMusic(true);
      ducked = true;
    }
    scorePulse();
  }

  function play(kind) {
    arm();
    if (isFxMuted()) return;
    fxBus.gain.value = 0.18;
    if (kind === 'shoot') {
      noise(.085,.18,550);
      oscillator({ frequency:126,duration:.075,type:'square',gain:.16,slide:-65 });
      oscillator({ frequency:58,duration:.13,type:'sine',gain:.11,slide:-20 });
    } else if (kind === 'hit') {
      noise(.055,.10,900);
      oscillator({ frequency:92,duration:.08,type:'triangle',gain:.12,slide:-34 });
    } else if (kind === 'move') {
      oscillator({ frequency:64,duration:.035,type:'triangle',gain:.045,slide:-10 });
    } else if (kind === 'reload') {
      oscillator({ frequency:720,duration:.035,type:'square',gain:.045,slide:-160 });
      oscillator({ frequency:510,duration:.045,type:'square',gain:.04,slide:120,delay:.09 });
    } else if (kind === 'intel') {
      oscillator({ frequency:520,duration:.08,type:'sine',gain:.08,slide:180 });
      oscillator({ frequency:780,duration:.13,type:'sine',gain:.065,slide:140,delay:.09 });
    } else if (kind === 'overwatch') {
      oscillator({ frequency:185,duration:.08,type:'triangle',gain:.055,slide:70 });
    } else if (kind === 'turn') {
      oscillator({ frequency:74,duration:.14,type:'sine',gain:.055,slide:-12 });
    } else if (kind === 'complete') {
      oscillator({ frequency:220,duration:.18,type:'triangle',gain:.07,slide:90 });
      oscillator({ frequency:330,duration:.3,type:'sine',gain:.065,slide:110,delay:.16 });
    }
  }

  return {
    arm,
    play,
    setThreat(value) { threat = Math.max(0, Math.min(1, Number(value) || 0)); },
    destroy() {
      if (scoreTimer) window.clearTimeout(scoreTimer);
      scoreTimer = null;
      scoreStarted = false;
      if (ducked) {
        duckAmbientMusic(false);
        ducked = false;
      }
      if (!ctx) return;
      try { master?.disconnect(); } catch {}
      void ctx.close().catch(() => {});
      ctx = null;
      master = null;
      musicBus = null;
      fxBus = null;
    },
  };
}
