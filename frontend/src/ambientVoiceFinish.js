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
  let voice = dry;
  if (tremolo > 0 && typeof ctx.createOscillator === 'function') {
    const modulation = ctx.createGain();
    modulation.gain.value = 1;
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.type = 'sine';
    lfo.frequency.value = tremolo;
    depth.gain.value = 0.09;
    lfo.connect(depth);
    depth.connect(modulation.gain);
    dry.connect(modulation);
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
