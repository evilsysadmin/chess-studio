// Premium structured-voice timbre.
//
// Composition decides WHAT plays. This module only decides how the oscillator
// partials behave as one physical-ish instrument: body emphasis, exposed-edge
// control and microtuning. Keeping this pure makes the expensive WebAudio graph
// small and lets tests enforce that acoustic voices do not regress into a
// chorus/organ preset.

const DEFAULT_TIMBRE = Object.freeze({
  filterQ: 0.48,
  bodyHz: 0,
  bodyGainDb: 0,
  bodyQ: 0.72,
  edgeHz: 0,
  edgeGainDb: 0,
  detuneSpread: 0.22,
  coherentPartials: true,
  tremoloScale: 1,
});

function timbre(overrides) {
  return Object.freeze({ ...DEFAULT_TIMBRE, ...overrides });
}

const STRUCTURED_TIMBRES = Object.freeze({
  felt: timbre({ filterQ:0.36, bodyHz:690, bodyGainDb:1.2, detuneSpread:0.14 }),
  feltGrand: timbre({ filterQ:0.34, bodyHz:720, bodyGainDb:1.6, detuneSpread:0.12 }),
  tapePiano: timbre({ filterQ:0.32, bodyHz:640, bodyGainDb:1.8, edgeHz:2850, edgeGainDb:-1.8, detuneSpread:0.18, tremoloScale:0.72 }),
  epiano: timbre({ filterQ:0.38, bodyHz:760, bodyGainDb:1.7, detuneSpread:0.16 }),
  rhodesWarm: timbre({ filterQ:0.34, bodyHz:710, bodyGainDb:2.0, edgeHz:2450, edgeGainDb:-1.6, detuneSpread:0.14, tremoloScale:0.68 }),
  housePiano: timbre({ filterQ:0.50, bodyHz:940, bodyGainDb:1.0, detuneSpread:0.24 }),

  vibes: timbre({ filterQ:0.42, bodyHz:1220, bodyGainDb:0.8, detuneSpread:0.10, tremoloScale:0.82 }),
  warmVibes: timbre({ filterQ:0.38, bodyHz:1080, bodyGainDb:1.2, detuneSpread:0.10, tremoloScale:0.76 }),
  marimba: timbre({ filterQ:0.38, bodyHz:780, bodyGainDb:1.1, detuneSpread:0.08 }),
  warmMarimba: timbre({ filterQ:0.34, bodyHz:720, bodyGainDb:1.4, detuneSpread:0.08 }),
  singingBowl: timbre({ filterQ:0.32, bodyHz:980, bodyGainDb:0.9, detuneSpread:0.07, tremoloScale:0.62 }),
  harpsichord: timbre({ filterQ:0.44, bodyHz:1320, bodyGainDb:0.8, edgeHz:4300, edgeGainDb:-1.2, detuneSpread:0.05 }),
  glass: timbre({ filterQ:0.30, bodyHz:1480, bodyGainDb:0.7, edgeHz:5200, edgeGainDb:-0.8, detuneSpread:0.05, tremoloScale:0.54 }),

  organ: timbre({ filterQ:0.28, bodyHz:520, bodyGainDb:2.3, edgeHz:2100, edgeGainDb:-3.4, detuneSpread:0.07 }),
  organbass: timbre({ filterQ:0.26, bodyHz:150, bodyGainDb:1.8, edgeHz:900, edgeGainDb:-3.8, detuneSpread:0.05 }),
  choir: timbre({ filterQ:0.30, bodyHz:720, bodyGainDb:1.5, edgeHz:2200, edgeGainDb:-2.6, detuneSpread:0.18, tremoloScale:0.58 }),

  cello: timbre({ filterQ:0.34, bodyHz:390, bodyGainDb:1.4, edgeHz:2100, edgeGainDb:-1.8, detuneSpread:0.12 }),
  spiccatoCello: timbre({ filterQ:0.44, bodyHz:460, bodyGainDb:1.0, detuneSpread:0.10 }),
  strings: timbre({ filterQ:0.38, bodyHz:520, bodyGainDb:1.0, detuneSpread:0.34, coherentPartials:false, tremoloScale:0.72 }),
  spiccatoStrings: timbre({ filterQ:0.46, bodyHz:620, bodyGainDb:0.8, detuneSpread:0.24, coherentPartials:false }),

  uprightBass: timbre({ filterQ:0.32, bodyHz:190, bodyGainDb:1.7, edgeHz:1200, edgeGainDb:-1.8, detuneSpread:0.08 }),
  bass: timbre({ filterQ:0.38, bodyHz:170, bodyGainDb:1.2, detuneSpread:0.10 }),
  pizz: timbre({ filterQ:0.42, bodyHz:360, bodyGainDb:1.0, detuneSpread:0.08 }),

  mutedHorn: timbre({ filterQ:0.36, edgeHz:1850, edgeGainDb:-2.7, detuneSpread:0.10, tremoloScale:0.62 }),
  brass: timbre({ filterQ:0.46, edgeHz:2500, edgeGainDb:-1.8, detuneSpread:0.18 }),
  clarinet: timbre({ filterQ:0.34, edgeHz:2200, edgeGainDb:-2.8, detuneSpread:0.08, tremoloScale:0.60 }),
  ney: timbre({ filterQ:0.30, edgeHz:2500, edgeGainDb:-1.6, detuneSpread:0.07, tremoloScale:0.68 }),
  breathFlute: timbre({ filterQ:0.30, edgeHz:2700, edgeGainDb:-1.8, detuneSpread:0.06, tremoloScale:0.60 }),
  cedarFlute: timbre({ filterQ:0.28, edgeHz:2400, edgeGainDb:-2.0, detuneSpread:0.06, tremoloScale:0.58 }),
  bandoneon: timbre({ filterQ:0.42, bodyHz:680, bodyGainDb:1.0, edgeHz:2600, edgeGainDb:-2.0, detuneSpread:0.12 }),
  oudJazz: timbre({ filterQ:0.36, bodyHz:520, bodyGainDb:2.2, edgeHz:2100, edgeGainDb:-2.4, detuneSpread:0.08 }),
  qanun: timbre({ filterQ:0.38, bodyHz:980, bodyGainDb:1.4, edgeHz:3600, edgeGainDb:-1.4, detuneSpread:0.06 }),
  buzuq: timbre({ filterQ:0.38, bodyHz:680, bodyGainDb:1.8, edgeHz:2900, edgeGainDb:-2.0, detuneSpread:0.07 }),

  tremolo: timbre({ filterQ:0.38, bodyHz:820, bodyGainDb:1.2, edgeHz:2600, edgeGainDb:-1.8, detuneSpread:0.12, tremoloScale:0.72 }),
  tropicalPluck: timbre({ filterQ:0.46, bodyHz:980, bodyGainDb:1.0, edgeHz:3800, edgeGainDb:-1.0, detuneSpread:0.12 }),
  vocalAir: timbre({ filterQ:0.32, bodyHz:760, bodyGainDb:0.8, edgeHz:2400, edgeGainDb:-1.4, detuneSpread:0.10, tremoloScale:0.55 }),

  pad: timbre({ filterQ:0.32, detuneSpread:0.52, coherentPartials:false }),
  widePad: timbre({ filterQ:0.38, detuneSpread:0.92, coherentPartials:false, tremoloScale:0.72 }),
  powerPad: timbre({ filterQ:0.50, detuneSpread:1.10, coherentPartials:false, tremoloScale:0.68 }),
  stormPad: timbre({ filterQ:0.34, detuneSpread:0.72, coherentPartials:false, tremoloScale:0.70 }),
  synth: timbre({ filterQ:1.12, detuneSpread:0.74, coherentPartials:false }),
  analogLead: timbre({ filterQ:0.92, detuneSpread:1.18, coherentPartials:false, tremoloScale:0.78 }),
  anthemLead: timbre({ filterQ:0.86, detuneSpread:1.30, coherentPartials:false, tremoloScale:0.74 }),
  neonBrass: timbre({ filterQ:0.72, detuneSpread:0.82, coherentPartials:false, tremoloScale:0.76 }),
  arcadePulse: timbre({ filterQ:0.92, detuneSpread:0.54, coherentPartials:false }),
  stormPluck: timbre({ filterQ:0.62, detuneSpread:0.34, coherentPartials:false }),
  metallic: timbre({ filterQ:0.70, detuneSpread:0.42, coherentPartials:false }),
  arp: timbre({ filterQ:1.18, detuneSpread:0.58, coherentPartials:false }),
  pulse: timbre({ filterQ:0.96, detuneSpread:0.48, coherentPartials:false }),
  subPulse: timbre({ filterQ:0.52, detuneSpread:0.20, coherentPartials:false }),
  synthbass: timbre({ filterQ:0.64, detuneSpread:0.22, coherentPartials:false }),
});

export const PREMIUM_STRUCTURED_TIMBRE_IDS = Object.freeze(Object.keys(STRUCTURED_TIMBRES));

export function structuredVoiceTimbre(kind) {
  return STRUCTURED_TIMBRES[kind] || DEFAULT_TIMBRE;
}

export function structuredPartialDetune(kind, midiNote, partialIndex, authoredDriftCents = 0) {
  const profile = structuredVoiceTimbre(kind);
  const index = Math.max(0, Number(partialIndex) || 0);
  const drift = Math.max(0, Math.min(2.4, Number(authoredDriftCents) || 0));
  const note = Math.round(Number(midiNote) || 0);
  const noteMotion = [-0.24, 0.12, -0.08, 0.20, -0.16, 0.06][Math.abs(note) % 6] * drift;

  if (profile.coherentPartials) {
    if (index === 0) return noteMotion;
    const direction = index % 2 === 0 ? -1 : 1;
    return noteMotion + (direction * profile.detuneSpread * Math.min(1, index * 0.24));
  }

  const direction = index % 2 === 0 ? -1 : 1;
  return noteMotion + (direction * (
    profile.detuneSpread * (0.68 + Math.min(index, 4) * 0.22)
    + drift * 0.12
  ));
}

export { DEFAULT_TIMBRE, STRUCTURED_TIMBRES };
