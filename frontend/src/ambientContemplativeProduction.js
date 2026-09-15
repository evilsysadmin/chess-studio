function finish(name, brightness, driftCents, reflectionScale, stereoWidth) {
  return Object.freeze({ name, brightness, driftCents, reflectionScale, stereoWidth });
}

const FINISHES = Object.freeze({
  moonWater: finish('moon-water', 1.08, 1.2, 1.12, 1.12),
  cedarAir: finish('cedar-air', 0.90, 2.4, 1.18, 1.08),
  cassetteRain: finish('cassette-rain', 0.72, 5.8, 0.78, 0.82),
  windowGlow: finish('window-glow', 0.88, 3.2, 0.92, 1.02),
  pencilPaper: finish('pencil-paper', 0.80, 2.2, 0.72, 0.76),
  feltRoom: finish('felt-room', 0.84, 1.4, 1.04, 0.94),
  verticalHall: finish('vertical-hall', 0.92, 0.8, 1.18, 1.16),
  winterGlass: finish('winter-glass', 0.86, 1.6, 1.22, 1.18),
  clockworkFelt: finish('clockwork-felt', 0.96, 0.4, 0.74, 0.72),
  geometricFelt: finish('geometric-felt', 0.90, 0.7, 0.86, 0.84),
});

function signature(instrument, motif, {
  sections = [0, 1], everyCycles = 3, repeatPeriod = 64, durationSteps = 5.2, volume = 0.16,
} = {}) {
  return Object.freeze({
    instrument,
    sections: Object.freeze(sections),
    everyCycles,
    repeatPeriod,
    durationSteps,
    volume,
    motif: Object.freeze(motif),
  });
}

function percussion(kit, period, pattern, punch = 0.6) {
  return Object.freeze({ kit, period, punch, pattern: Object.freeze(pattern) });
}

// These profiles are intentionally explicit. Quiet music exposes repeated
// timbres more readily than a dense arrangement, so each room gets its own
// instrument, stereo behaviour and reflection rather than a genre-wide preset.
const CONTEMPLATIVE_PRODUCTION = Object.freeze({
  nocturne: Object.freeze({
    family: 'white-nocturne-felt-grand-room',
    leadInstrument: 'feltGrand', chordInstrument: 'feltGrand', bassInstrument: 'cello',
    finish: FINISHES.feltRoom, space: 0.21, delayMs: 238, chordHoldSteps: 22,
    signature: signature('feltGrand', { 8:72, 24:76, 40:69, 56:74 }, { sections:[0], durationSteps:7.2 }),
  }),
  mistSpa: Object.freeze({
    family: 'cedar-spa-air-and-bowl',
    leadInstrument: 'cedarFlute', chordInstrument: 'singingBowl', bassInstrument: 'widePad',
    finish: FINISHES.cedarAir, space: 0.30, delayMs: 336, chordHoldSteps: 28, bassHoldSteps: 22,
    signature: signature('cedarFlute', { 6:69, 30:74, 54:67 }, { sections:[0,2], everyCycles:4, repeatPeriod:72, durationSteps:8.0, volume:0.14 }),
  }),
  moonOnsen: Object.freeze({
    family: 'onsen-warm-wood-moon-water',
    leadInstrument: 'warmMarimba', counterInstrument: 'cedarFlute', chordInstrument: 'glass', bassInstrument: 'cello',
    finish: FINISHES.moonWater, space: 0.30, delayMs: 292, chordHoldSteps: 26, bassHoldSteps: 14,
    percussion: percussion('onsen-water', 40, { 8:'B', 28:'B' }, 0.34),
    signature: signature('glass', { 4:76, 20:83, 44:79, 60:86 }, { sections:[0,2], repeatPeriod:80, durationSteps:6.8, volume:0.13 }),
  }),
  zenCourtyard0408: Object.freeze({
    leadInstrument: 'cedarFlute', counterInstrument: 'cello', chordInstrument: 'singingBowl', bassInstrument: 'widePad',
    finish: FINISHES.cedarAir, delayMs: 318, chordHoldSteps: 30, bassHoldSteps: 24,
  }),
  lofiRainTape: Object.freeze({
    family: 'lofi-rain-cassette',
    leadInstrument: 'tapePiano', counterInstrument: 'rhodesWarm', chordInstrument: 'rhodesWarm', bassInstrument: 'uprightBass',
    finish: FINISHES.cassetteRain, delayMs: 146,
    percussion: percussion('lofi-cassette-rain', 16, { 0:'K', 8:'B', 14:'H' }, 0.58),
  }),
  lofiWindowLight: Object.freeze({
    family: 'lofi-window-warm-vibes-brush',
    leadInstrument: 'warmVibes', counterInstrument: 'nylonGuitar', chordInstrument: 'rhodesWarm', bassInstrument: 'uprightBass',
    finish: FINISHES.windowGlow, delayMs: 118,
    percussion: percussion('lofi-window-brush', 16, { 0:'B', 6:'H', 12:'S', 15:'H' }, 0.64),
  }),
  lofiPawnNotebook: Object.freeze({
    family: 'lofi-notebook-pencil-felt',
    leadInstrument: 'feltGrand', counterInstrument: 'warmVibes', chordInstrument: 'rhodesWarm', bassInstrument: 'uprightBass',
    finish: FINISHES.pencilPaper, delayMs: 102,
    percussion: percussion('lofi-pencil-brush', 32, { 0:'B', 10:'W', 16:'B', 26:'W' }, 0.54),
  }),
  fourSquares: Object.freeze({
    family: 'four-squares-felt-grand-pizz',
    leadInstrument: 'feltGrand', counterInstrument: 'pizz', chordInstrument: 'feltGrand', bassInstrument: 'cello',
    finish: FINISHES.geometricFelt, delayMs: 176, chordHoldSteps: 20, bassHoldSteps: 8,
    signature: signature('pizz', { 4:60, 20:67, 36:63, 52:70 }, { sections:[0,2], repeatPeriod:64, durationSteps:3.6, volume:0.15 }),
  }),
  verticalRainPiano: Object.freeze({
    family: 'vertical-rain-grand-and-cello-hall',
    leadInstrument: 'feltGrand', counterInstrument: 'cello', chordInstrument: 'feltGrand', bassInstrument: 'cello',
    finish: FINISHES.verticalHall, delayMs: 284, chordHoldSteps: 30, bassHoldSteps: 18,
  }),
  rainOnE4: Object.freeze({
    family: 'rain-e4-tape-piano-window-cello',
    leadInstrument: 'tapePiano', counterInstrument: 'cello', chordInstrument: 'tapePiano', bassInstrument: 'cello',
    finish: FINISHES.cassetteRain, delayMs: 304, chordHoldSteps: 28, bassHoldSteps: 20,
    signature: signature('tapePiano', { 10:76, 26:71, 42:74, 58:69 }, { sections:[0,1], everyCycles:3, durationSteps:7.2 }),
  }),
  sixtyFourKeys: Object.freeze({
    family: 'sixty-four-felt-grand-pizz-clockwork',
    leadInstrument: 'feltGrand', counterInstrument: 'pizz', chordInstrument: 'feltGrand', bassInstrument: 'cello',
    finish: FINISHES.clockworkFelt, delayMs: 134, chordHoldSteps: 16, bassHoldSteps: 7,
  }),
  winterBoard: Object.freeze({
    family: 'winter-board-strings-frosted-grand',
    leadInstrument: 'strings', counterInstrument: 'cedarFlute', chordInstrument: 'feltGrand', bassInstrument: 'cello',
    finish: FINISHES.winterGlass, delayMs: 324, chordHoldSteps: 28, bassHoldSteps: 18,
  }),
});

export const CONTEMPLATIVE_PRODUCTION_IDS = Object.freeze(Object.keys(CONTEMPLATIVE_PRODUCTION));

export function withContemplativeProduction(theme, feel) {
  const production = CONTEMPLATIVE_PRODUCTION[theme?.id];
  if (!production || !feel) return feel;
  return Object.freeze({
    ...feel,
    ...production,
    layers: Object.freeze({ ...(feel.layers || {}), signature: Boolean(production.signature || feel.signature) }),
    mix: Object.freeze({ ...(feel.mix || {}) }),
  });
}

export { CONTEMPLATIVE_PRODUCTION, FINISHES as CONTEMPLATIVE_FINISHES };
