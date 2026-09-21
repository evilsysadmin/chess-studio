import { connectOrganicWindBreath, organicWindFinishSettings } from './ambientOrganicWindFinish.js';

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

// An instrument opens as it speaks and darkens at the end of its phrase.
// All automation stays inside the amplitude envelope; the last frequency
// event happens before the voice stops, even for a very short bass note.
export function scheduleAmbientFilterSweep(frequency, cutoff, start, attack, duration) {
  const opening = Math.max(0.006, Math.min(attack, duration * 0.38));
  frequency.setValueAtTime(Math.max(260, cutoff * 0.72), start);
  frequency.exponentialRampToValueAtTime(cutoff, start + opening);
  frequency.exponentialRampToValueAtTime(Math.max(260, cutoff * 0.68), start + Math.max(opening, duration * 0.9));
}

// Single finite voice graph: shallow tremolo AFTER the fading envelope, a
// narrow stereo position, and one filtered reflection. No delay feedback or
// oscillator is kept alive after the note, and unsupported nodes fall back to
// a plain dry signal.
export function connectFinishedAmbientVoice(ctx, dry, output, tone = {}, { start = ctx.currentTime, duration = 1, tremolo = 0, wetLimit = 0.3 } = {}) {
  const finish = tone?.finish || {};
  const organicWind = organicWindFinishSettings(finish, tremolo);
  let voice = dry;

  if (organicWind) {
    // Air enters the same authored amplitude envelope as the pitched voice, so
    // quiet counter-lines stay quiet and long notes do not acquire a fixed hiss.
    connectOrganicWindBreath(ctx, dry, organicWind, { start, duration });

    // A tiny body resonance takes the sterile oscillator edge off clarinet/ney
    // without changing their written register or replacing them with a flute.
    if (typeof ctx.createBiquadFilter === 'function') {
      const body = ctx.createBiquadFilter();
      body.type = 'peaking';
      body.frequency.value = organicWind.bodyHz;
      body.Q.value = 0.78;
      body.gain.value = organicWind.bodyGainDb;
      dry.connect(body);
      voice = body;

      // Clarinet and muted horn still contain square/saw energy in their core.
      // A shallow high shelf removes only that exposed digital edge; the body,
      // attack and written articulation stay intact. Flutes/ney skip this stage.
      if (Number.isFinite(organicWind.edgeHz) && Number(organicWind.edgeGainDb) < -0.1) {
        const edge = ctx.createBiquadFilter();
        edge.type = 'highshelf';
        edge.frequency.value = organicWind.edgeHz;
        edge.gain.value = organicWind.edgeGainDb;
        voice.connect(edge);
        voice = edge;
      }
    }
  }

  if (tremolo > 0 && typeof ctx.createOscillator === 'function') {
    const modulation = ctx.createGain();
    modulation.gain.value = 1;
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.type = 'sine';
    lfo.frequency.value = tremolo;
    if (typeof depth.gain?.setValueAtTime === 'function' && typeof depth.gain?.linearRampToValueAtTime === 'function') {
      if (organicWind) {
        // Real breath/reed vibrato blooms after the attack instead of arriving at
        // full depth on sample zero. Keep the modulation shallower than synths.
        depth.gain.setValueAtTime(0.008, start);
        depth.gain.linearRampToValueAtTime(organicWind.tremoloDepth, start + Math.min(0.22, duration * 0.34));
      } else {
        // No vibrato de preset desde sample cero: en notas cortas apenas existe,
        // y en objetivos largos aparece después del ataque. Así la misma voz
        // puede frasear sin delatar un LFO idéntico en cada nota.
        const durationWeight = clamp((duration - 0.12) / 0.95, 0, 1);
        const targetDepth = 0.008 + (0.082 * durationWeight);
        const initialDepth = Math.min(0.004, targetDepth * 0.35);
        const bloomTime = Math.min(0.24, Math.max(0.045, duration * 0.30));
        depth.gain.setValueAtTime(initialDepth, start);
        depth.gain.linearRampToValueAtTime(targetDepth, start + bloomTime);
      }
    } else {
      const durationWeight = clamp((duration - 0.12) / 0.95, 0, 1);
      depth.gain.value = organicWind?.tremoloDepth ?? (0.008 + (0.082 * durationWeight));
    }
    lfo.connect(depth);
    depth.connect(modulation.gain);
    voice.connect(modulation);
    lfo.start(start);
    lfo.stop(start + duration + 0.05);
    voice = modulation;
  }

  let destination = output;
  if (typeof ctx.createStereoPanner === 'function' && Math.abs(Number(tone?.pan) || 0) > 0.001) {
    const panner = ctx.createStereoPanner();
    const stereoWidth = clamp(Number(finish.stereoWidth) || 1, 0.65, 1.25);
    const panLimit = tone?.finish ? 0.22 : 0.18;
    panner.pan.value = clamp(Number(tone.pan) * stereoWidth, -panLimit, panLimit);
    panner.connect(output);
    destination = panner;
  }
  voice.connect(destination);

  if (Number(tone?.space) > 0 && typeof ctx.createDelay === 'function') {
    const delay = ctx.createDelay(0.65);
    const wet = ctx.createGain();
    delay.delayTime.value = clamp((Number(tone.delayMs) || 180) / 1000, 0.06, 0.55);
    const reflectionScale = clamp(Number(finish.reflectionScale) || 1, 0.65, 1.3);
    wet.gain.value = clamp(Number(tone.space) * reflectionScale, 0, wetLimit);
    voice.connect(delay);
    if (typeof ctx.createBiquadFilter === 'function') {
      const damping = ctx.createBiquadFilter();
      damping.type = 'lowpass';
      damping.frequency.value = clamp(2400 * (Number(tone.warmth) || 1), 1200, 3600);
      delay.connect(damping);
      damping.connect(wet);
    } else {
      delay.connect(wet);
    }
    wet.connect(destination);
  }
}
