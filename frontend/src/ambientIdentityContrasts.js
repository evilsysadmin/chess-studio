const IDENTITY_CONTRASTS = Object.freeze({
  rainOnE4: Object.freeze({
    family: 'rain-felt-cello-window-room',
    leadInstrument: 'felt',
    counterInstrument: 'cello',
    chordInstrument: 'felt',
    bassInstrument: 'cello',
    warmth: 1.04,
    releaseScale: 1.72,
    space: 0.29,
    delayMs: 304,
    chordHoldSteps: 28,
    bassHoldSteps: 20,
    layers: Object.freeze({ lead: true, counter: true, chords: true, bass: true, drums: false, signature: true }),
    mix: Object.freeze({ lead: 0.50, counter: 0.22, bass: 0.26, chord: 0.28 }),
    signature: Object.freeze({
      instrument: 'felt',
      sections: Object.freeze([0, 1]),
      everyCycles: 3,
      repeatPeriod: 64,
      durationSteps: 7.2,
      volume: 0.16,
      motif: Object.freeze({ 10:76, 26:71, 42:74, 58:69 }),
    }),
  }),
  sixtyFourKeys: Object.freeze({
    family: 'sixty-four-keys-pizz-clockwork',
    leadInstrument: 'felt',
    counterInstrument: 'pizz',
    chordInstrument: 'felt',
    bassInstrument: 'cello',
    warmth: 0.88,
    releaseScale: 1.18,
    space: 0.11,
    delayMs: 168,
    chordHoldSteps: 18,
    bassHoldSteps: 8,
    mix: Object.freeze({ lead: 0.60, counter: 0.38, bass: 0.42, chord: 0.39 }),
  }),
  cafeGambit213: Object.freeze({
    family: 'late-cafe-guitar-rim-combo',
    leadInstrument: 'jazzGuitar',
    counterInstrument: 'mutedHorn',
    chordInstrument: 'rhodesWarm',
    bassInstrument: 'uprightBass',
    swing: 0.19,
    warmth: 0.98,
    releaseScale: 1.06,
    space: 0.085,
    delayMs: 118,
    chordHoldSteps: 12,
    bassHoldSteps: 3.4,
    layers: Object.freeze({ lead: true, counter: true, chords: true, bass: true, drums: true, signature: true }),
    mix: Object.freeze({ lead: 0.66, counter: 0.32, bass: 0.86, chord: 0.44 }),
    percussion: Object.freeze({
      period: 24,
      kit: 'late-cafe-combo',
      punch: 0.72,
      pattern: Object.freeze({ 0:'K', 4:'B', 8:'W', 12:'K', 16:'B', 20:'S', 22:'H' }),
    }),
    signature: Object.freeze({
      instrument: 'jazzGuitar',
      sections: Object.freeze([0, 1]),
      everyCycles: 2,
      repeatPeriod: 64,
      durationSteps: 4.2,
      volume: 0.19,
      motif: Object.freeze({ 6:67, 18:71, 38:64, 54:69 }),
    }),
  }),
});

export const IDENTITY_CONTRAST_IDS = Object.freeze(Object.keys(IDENTITY_CONTRASTS));

export function withAmbientIdentityContrast(theme, feel) {
  const profile = IDENTITY_CONTRASTS[theme?.id];
  if (!profile || !feel) return feel;
  return Object.freeze({ ...feel, ...profile });
}

export { IDENTITY_CONTRASTS };
