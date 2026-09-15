const WIND_VOICE_BY_TREMOLO = Object.freeze([
  Object.freeze({ name:'cedar-flute', rate:3.8, breathMix:0.050, breathHz:2100, breathSeconds:0.24, bodyHz:980, bodyGainDb:0.8, tremoloDepth:0.040 }),
  Object.freeze({ name:'clarinet', rate:4.0, breathMix:0.034, breathHz:1650, breathSeconds:0.17, bodyHz:760, bodyGainDb:1.8, tremoloDepth:0.052 }),
  Object.freeze({ name:'muted-horn', rate:4.4, breathMix:0.024, breathHz:1450, breathSeconds:0.13, bodyHz:680, bodyGainDb:1.3, tremoloDepth:0.040 }),
  Object.freeze({ name:'ney', rate:5.0, breathMix:0.056, breathHz:2250, breathSeconds:0.26, bodyHz:1080, bodyGainDb:0.9, tremoloDepth:0.046 }),
]);

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

export const ORGANIC_WIND_TREMOLO_RATES = Object.freeze(WIND_VOICE_BY_TREMOLO.map((voice) => voice.rate));

// The finish layer deliberately does not know instrument names: sound.js keeps
// that private to the voice renderer. These four tremolo rates are the authored
// identities of our sustained acoustic winds; neighbouring synth/vibes/string
// rates are intentionally excluded so a whole regional arrangement never gets
// sprayed with breath noise by accident.
export function organicWindFinishSettings(finish, tremolo) {
  if (!finish?.organicWind) return null;
  const rate = Number(tremolo);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  const voice = WIND_VOICE_BY_TREMOLO.find((candidate) => Math.abs(candidate.rate - rate) <= 0.025);
  if (!voice) return null;
  const scale = clamp(Number(finish.organicWindBreathScale) || 1, 0.65, 1.25);
  return Object.freeze({
    ...voice,
    breathMix:voice.breathMix * scale,
  });
}

// A short filtered air/reed transient is injected *into* the existing voice
// envelope. That makes it follow the note's authored velocity and attack rather
// than becoming an absolute-volume hiss. The finite buffer dies quickly and
// creates no oscillator/timer that can survive the note.
export function connectOrganicWindBreath(ctx, dryEnvelope, settings, { start = ctx?.currentTime || 0, duration = 1 } = {}) {
  if (!ctx || !dryEnvelope || !settings) return null;
  if (typeof ctx.createBuffer !== 'function' || typeof ctx.createBufferSource !== 'function'
    || typeof ctx.createBiquadFilter !== 'function' || typeof ctx.createGain !== 'function') return null;

  const sampleRate = Math.max(8000, Number(ctx.sampleRate) || 44100);
  const breathDuration = Math.max(0.05, Math.min(Number(duration) || 1, settings.breathSeconds));
  const frames = Math.max(1, Math.floor(sampleRate * breathDuration));
  const buffer = ctx.createBuffer(1, frames, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) {
    const progress = i / Math.max(1, frames - 1);
    // Strongest around the tongue/breath onset, then quickly becomes body air.
    const envelope = (1 - progress) ** 1.75;
    data[i] = (Math.random() * 2 - 1) * envelope;
  }

  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const mix = ctx.createGain();
  source.buffer = buffer;
  filter.type = 'bandpass';
  filter.frequency.value = settings.breathHz;
  filter.Q.value = 0.72;
  mix.gain.value = settings.breathMix;
  source.connect(filter);
  filter.connect(mix);
  mix.connect(dryEnvelope);
  source.start(start);
  source.stop(start + breathDuration + 0.01);
  return { source, filter, mix, duration:breathDuration };
}
