const ROCK_PROFILES = Object.freeze({
  postRockMidnight: Object.freeze({
    family: 'post-rock-crescendo-live-room',
    preserveSectionOrder: true,
    harmonyPath: Object.freeze([0, 0, -2, 5, 0, 3]),
    swing: 0.012,
    warmth: 0.78,
    releaseScale: 1.24,
    space: 0.19,
    delayMs: 205,
    leadInstrument: 'tremoloGuitar',
    counterInstrument: 'guitar2',
    chordInstrument: 'pad',
    bassInstrument: 'bass',
    chordHoldSteps: 24,
    bassHoldSteps: 5,
    layers: Object.freeze({ lead: true, counter: true, chords: true, bass: true, drums: true, signature: true }),
    mix: Object.freeze({ lead: 0.68, counter: 0.38, bass: 0.90, chord: 0.36 }),
    percussion: Object.freeze({
      period: 32,
      kit: 'post-rock-live-room',
      punch: 1.02,
      pattern: Object.freeze({ 0:'K', 4:'H', 8:'S', 12:'H', 16:'K', 20:'H', 24:'S', 28:'T', 30:'M' }),
    }),
    signature: Object.freeze({
      instrument: 'tremoloGuitar',
      sections: Object.freeze([0, 2]),
      everyCycles: 2,
      repeatPeriod: 64,
      durationSteps: 5.2,
      volume: 0.24,
      motif: Object.freeze({ 4:76, 12:79, 36:74, 44:72 }),
    }),
  }),
  rookGarage: Object.freeze({
    family: 'garage-rock-dry-amp-room',
    preserveSectionOrder: true,
    harmonyPath: Object.freeze([0, 0, 3, 5, 0]),
    swing: 0.026,
    warmth: 0.70,
    releaseScale: 0.82,
    space: 0.042,
    delayMs: 78,
    leadInstrument: 'overdriveGuitar',
    chordInstrument: 'overdriveGuitar',
    bassInstrument: 'bass',
    chordHoldSteps: 5,
    bassHoldSteps: 2.5,
    layers: Object.freeze({ lead: true, counter: false, chords: true, bass: true, drums: true, signature: true }),
    mix: Object.freeze({ lead: 0.82, counter: 0, bass: 1.06, chord: 0.39 }),
    percussion: Object.freeze({
      // The written riff advances every six steps. A 16-step backbeat made
      // the kit and guitars imply different tempi; this 12-step pocket locks
      // kick/snare to alternate riff attacks and reserves the last step for a
      // short live-room pickup.
      period: 12,
      kit: 'garage-live-dry',
      punch: 1.28,
      pattern: Object.freeze({ 0:'K', 3:'H', 6:'S', 9:'H', 11:'M' }),
    }),
    signature: Object.freeze({
      instrument: 'overdriveGuitar',
      sections: Object.freeze([0, 1]),
      everyCycles: 2,
      repeatPeriod: 48,
      durationSteps: 2.8,
      volume: 0.27,
      motif: Object.freeze({ 2:52, 8:55, 14:59, 20:57 }),
    }),
  }),
  desertDriveRock: Object.freeze({
    family: 'desert-road-tremolo-stomp',
    preserveSectionOrder: true,
    harmonyPath: Object.freeze([0, 0, -2, 5, 0]),
    swing: 0.095,
    warmth: 0.84,
    releaseScale: 1.04,
    space: 0.105,
    delayMs: 152,
    leadInstrument: 'guitar2',
    counterInstrument: 'mutedHorn',
    chordInstrument: 'tremoloGuitar',
    bassInstrument: 'uprightBass',
    chordHoldSteps: 14,
    bassHoldSteps: 4,
    layers: Object.freeze({ lead: true, counter: true, chords: true, bass: true, drums: true, signature: true }),
    mix: Object.freeze({ lead: 0.70, counter: 0.38, bass: 0.94, chord: 0.32 }),
    percussion: Object.freeze({
      period: 24,
      kit: 'desert-stomp-shuffle',
      punch: 1.10,
      pattern: Object.freeze({ 0:'K', 3:'H', 6:'S', 9:'H', 12:'K', 15:'B', 18:'S', 21:'H', 23:'W' }),
    }),
    signature: Object.freeze({
      instrument: 'mutedHorn',
      sections: Object.freeze([0, 1]),
      everyCycles: 2,
      repeatPeriod: 48,
      durationSteps: 4.8,
      volume: 0.22,
      motif: Object.freeze({ 3:69, 15:67, 27:72, 39:64 }),
    }),
  }),
});

export const ROCK_PRODUCTION_IDS = Object.freeze(Object.keys(ROCK_PROFILES));

export function withRockProduction(theme, feel) {
  const profile = ROCK_PROFILES[theme?.id];
  if (!profile || !feel) return feel;
  return Object.freeze({ ...feel, ...profile });
}

export { ROCK_PROFILES };
